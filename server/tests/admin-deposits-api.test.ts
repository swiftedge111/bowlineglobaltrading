import { DepositMethod, TxCategory } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { getBalanceSnapshot } from "../src/services/ledger.service.js"
import { as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

/** The deposit queue: filters, order, summary, and approving what arrived. */
describe.skipIf(!hasDatabase)("admin deposits", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let client: Awaited<ReturnType<typeof createTestUser>>

  beforeAll(async () => {
    await cleanupTestUsers()
    admin = await createTestUser({ role: "ADMIN" })
    client = await createTestUser()
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.$disconnect()
  })

  const request = (amount: number, extra: { reference?: string; method?: DepositMethod; proofPath?: string; createdAt?: Date } = {}) =>
    testPrisma.depositRequest.create({
      data: {
        userId: client.id,
        amount: toMoney(amount),
        method: extra.method ?? DepositMethod.BANK_TRANSFER,
        reference: extra.reference ?? null,
        proofPath: extra.proofPath ?? null,
        ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
      },
    })

  type Row = {
    id: string
    reference: string | null
    method: string
    proofKind: string | null
    userApprovedDeposits: number
    reviewedBy: string | null
  }

  it("serves the pending queue oldest first, with proof kind and first-deposit count", async () => {
    const older = await request(100, { createdAt: new Date(Date.now() - 60_000), proofPath: "proofs/a.PNG" })
    const newer = await request(200, { proofPath: "proofs/b.pdf" })

    const response = await as(admin, "get", "/admin/deposits").query({ status: "PENDING", search: client.uid, limit: 100 }).expect(200)
    const rows: Row[] = response.body.data.items
    const ids = rows.map((row) => row.id)
    expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id))
    expect(rows.find((row) => row.id === older.id)!.proofKind).toBe("image")
    expect(rows.find((row) => row.id === newer.id)!.proofKind).toBe("pdf")
    expect(rows.every((row) => row.userApprovedDeposits === 0)).toBe(true)
  })

  it("finds a request by its reference and filters by method", async () => {
    const crypto = await request(50, { method: DepositMethod.CRYPTO, reference: "0xFEEDBEEF-tx" })

    const byRef = await as(admin, "get", "/admin/deposits").query({ search: "feedbeef" }).expect(200)
    expect((byRef.body.data.items as Row[]).map((row) => row.id)).toEqual([crypto.id])

    const byMethod = await as(admin, "get", "/admin/deposits").query({ method: "CRYPTO", search: client.uid }).expect(200)
    expect((byMethod.body.data.items as Row[]).every((row) => row.method === "CRYPTO")).toBe(true)
  })

  it("credits the amount that actually arrived and keeps the original", async () => {
    const pending = await request(500)
    const before = await getBalanceSnapshot(client.id)

    await as(admin, "post", `/admin/deposits/${pending.id}/process`)
      .send({ action: "approve", receivedAmount: 487.5, note: "Bank took a fee" })
      .expect(200)

    const after = await getBalanceSnapshot(client.id)
    expect(after.balance.sub(before.balance).toFixed(2)).toBe("487.50")

    const updated = await testPrisma.depositRequest.findUniqueOrThrow({ where: { id: pending.id } })
    expect(updated.amount.toFixed(2)).toBe("487.50")
    expect(updated.status).toBe("APPROVED")

    const tx = await testPrisma.transaction.findUniqueOrThrow({ where: { id: updated.transactionId! } })
    expect(tx.category).toBe(TxCategory.DEPOSIT)
    expect(tx.metadata).toMatchObject({ requestedAmount: "500.00" })

    const audit = await testPrisma.auditLog.findFirstOrThrow({
      where: { targetId: pending.id, action: "deposit.approve" },
    })
    expect(audit.before).toEqual({ amount: "500.00" })

    // The client now has an approved deposit, and the row says who reviewed it.
    const list = await as(admin, "get", "/admin/deposits").query({ search: client.uid, status: "APPROVED" }).expect(200)
    const row = (list.body.data.items as Row[]).find((item) => item.id === pending.id)!
    expect(row.userApprovedDeposits).toBe(1)
    expect(row.reviewedBy).toBe(admin.fullName)
  })

  it("approves the requested amount when none is given", async () => {
    const pending = await request(80)
    await as(admin, "post", `/admin/deposits/${pending.id}/process`).send({ action: "approve" }).expect(200)
    const updated = await testPrisma.depositRequest.findUniqueOrThrow({ where: { id: pending.id } })
    expect(updated.amount.toFixed(2)).toBe("80.00")
  })

  it("rejects a received amount on rejection, fractions of a cent, and zero", async () => {
    const pending = await request(60)
    const url = `/admin/deposits/${pending.id}/process`
    await as(admin, "post", url).send({ action: "reject", receivedAmount: 10 }).expect(400)
    await as(admin, "post", url).send({ action: "approve", receivedAmount: 10.005 }).expect(400)
    await as(admin, "post", url).send({ action: "approve", receivedAmount: 0 }).expect(400)
    // Two decimals that floats get wrong with a naive multipleOf check.
    await as(admin, "post", url).send({ action: "approve", receivedAmount: 0.07 }).expect(200)
  })

  it("summarises the queue", async () => {
    const response = await as(admin, "get", "/admin/deposits/summary").expect(200)
    const body = response.body.data
    expect(body.pending.count).toBeGreaterThanOrEqual(3)
    expect(body.pending.oldestAt).not.toBeNull()
    expect(body.approvedToday.count).toBeGreaterThanOrEqual(3)
    expect(Number(body.approved30d.amount)).toBeGreaterThanOrEqual(567.57)
  })
})
