import { TxCategory, WithdrawalMethod } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { issuePin } from "../src/modules/pins/pins.service.js"
import { createWithdrawal } from "../src/modules/withdrawals/withdrawals.service.js"
import { credit, getBalanceSnapshot } from "../src/services/ledger.service.js"
import { as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

/** The withdrawal queue: filters, reviewer signals, summary, payout reference. */
describe.skipIf(!hasDatabase)("admin withdrawals", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let client: Awaited<ReturnType<typeof createTestUser>>

  const WALLET = "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"

  beforeAll(async () => {
    await cleanupTestUsers()
    admin = await createTestUser({ role: "ADMIN" })
    client = await createTestUser()
    await credit({ userId: client.id, amount: toMoney(1000), category: TxCategory.DEPOSIT })
    // Profit, so the client can ask for more than they paid in.
    await credit({ userId: client.id, amount: toMoney(2000), category: TxCategory.PROFIT })
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.$disconnect()
  })

  async function withdraw(amount: number, walletAddress = WALLET) {
    const { pin } = await issuePin({ userId: client.id, issuedById: admin.id, length: 6, ttlMinutes: 60 })
    return createWithdrawal(client.id, {
      amount,
      method: WithdrawalMethod.CRYPTO,
      pin,
      walletAddress,
      network: "TRC20",
      currency: "USDT",
    })
  }

  type Row = {
    id: string
    total: string
    payoutReference: string | null
    reviewedBy: string | null
    signals: { previousPayouts: number; newDestination: boolean; deposited: string; exceedsDeposits: boolean }
  }

  const find = async (id: string, status = "PENDING") => {
    const response = await as(admin, "get", "/admin/withdrawals").query({ status, search: client.uid, limit: 100 }).expect(200)
    return (response.body.data.items as Row[]).find((row) => row.id === id)!
  }

  it("flags a first payout to a new wallet", async () => {
    const first = await withdraw(100)
    const row = await find(first.id)
    expect(row.total).toBe("105.00")
    expect(row.signals).toEqual({ previousPayouts: 0, newDestination: true, deposited: "1000.00", exceedsDeposits: false })
  })

  it("records the payout reference on the client's ledger entry", async () => {
    const pending = await testPrisma.withdrawalRequest.findFirstOrThrow({
      where: { userId: client.id, status: "PENDING" },
    })
    await as(admin, "post", `/admin/withdrawals/${pending.id}/process`)
      .send({ action: "approve", payoutReference: "TXHASH-abc123" })
      .expect(200)

    const tx = await testPrisma.transaction.findUniqueOrThrow({ where: { id: pending.transactionId } })
    expect(tx.status).toBe("COMPLETED")
    // The reference joins the metadata written at request time; nothing is lost.
    expect(tx.metadata).toMatchObject({ payoutReference: "TXHASH-abc123", netAmount: "100.00", fee: "5.00" })

    const row = await find(pending.id, "APPROVED")
    expect(row.payoutReference).toBe("TXHASH-abc123")
    expect(row.reviewedBy).toBe(admin.fullName)
  })

  it("knows a wallet it has paid before, and spots a request above deposits", async () => {
    const same = await withdraw(1500, WALLET.toLowerCase())
    const sameRow = await find(same.id)
    expect(sameRow.signals.previousPayouts).toBe(1)
    // Matched however the address is cased.
    expect(sameRow.signals.newDestination).toBe(false)
    expect(sameRow.signals.exceedsDeposits).toBe(true)

    await as(admin, "post", `/admin/withdrawals/${same.id}/process`).send({ action: "reject", note: "Check" }).expect(200)

    const other = await withdraw(50, "TDifferentWalletAddress0000000001")
    expect((await find(other.id)).signals.newDestination).toBe(true)
  })

  it("finds a request by wallet address and filters by method", async () => {
    const byWallet = await as(admin, "get", "/admin/withdrawals").query({ search: "TDifferentWallet" }).expect(200)
    expect(byWallet.body.data.items).toHaveLength(1)

    const bank = await as(admin, "get", "/admin/withdrawals").query({ method: "BANK", search: client.uid }).expect(200)
    expect(bank.body.data.items).toHaveLength(0)
  })

  it("refuses a payout reference on a rejection", async () => {
    const pending = await testPrisma.withdrawalRequest.findFirstOrThrow({
      where: { userId: client.id, status: "PENDING" },
    })
    await as(admin, "post", `/admin/withdrawals/${pending.id}/process`)
      .send({ action: "reject", payoutReference: "nope" })
      .expect(400)
  })

  it("summarises the queue and what was paid", async () => {
    const response = await as(admin, "get", "/admin/withdrawals/summary").expect(200)
    const body = response.body.data
    expect(body.pending.count).toBeGreaterThanOrEqual(1)
    expect(body.pending.oldestAt).not.toBeNull()
    expect(body.paidToday.count).toBeGreaterThanOrEqual(1)
    expect(Number(body.paid30d.fees)).toBeGreaterThanOrEqual(5)
    expect(body.rejected30d).toBeGreaterThanOrEqual(1)

    // The rejected request's reservation went back to the client.
    const { reserved } = await getBalanceSnapshot(client.id)
    expect(reserved.toFixed(2)).toBe("52.50")
  })
})
