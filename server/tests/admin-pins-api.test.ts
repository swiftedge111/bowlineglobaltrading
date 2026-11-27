import { TxCategory, WithdrawalMethod } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { createWithdrawal } from "../src/modules/withdrawals/withdrawals.service.js"
import { credit } from "../src/services/ledger.service.js"
import { as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

/** The PIN list: what each PIN was spent on, filters, share-link state, summary. */
describe.skipIf(!hasDatabase)("admin PINs", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let client: Awaited<ReturnType<typeof createTestUser>>

  beforeAll(async () => {
    await cleanupTestUsers()
    admin = await createTestUser({ role: "ADMIN" })
    client = await createTestUser()
    await credit({ userId: client.id, amount: toMoney(1000), category: TxCategory.DEPOSIT })
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.$disconnect()
  })

  const issue = (body: Record<string, unknown> = {}) =>
    as(admin, "post", `/admin/users/${client.uid}/pins`).send({ notifyUser: false, ...body }).expect(201)

  type Row = {
    id: string
    status: string
    issuedBy: string | null
    share: string
    withdrawal: { id: string; amount: string; status: string } | null
  }

  const list = async (query: Record<string, string> = {}) => {
    const response = await as(admin, "get", "/admin/pins").query({ search: client.uid, limit: 100, ...query }).expect(200)
    return response.body.data.items as Row[]
  }

  it("links a used PIN to the withdrawal it authorised", async () => {
    const issued = await issue()
    const withdrawal = await createWithdrawal(client.id, {
      amount: 100,
      method: WithdrawalMethod.CRYPTO,
      pin: issued.body.data.pin,
      walletAddress: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
      network: "TRC20",
      currency: "USDT",
    })

    const row = (await list({ status: "USED" }))[0]!
    expect(row.withdrawal).toEqual(
      expect.objectContaining({ id: withdrawal.id, amount: "100.00", status: "PENDING" })
    )
    expect(row.issuedBy).toBe(admin.fullName)
    // Nothing about the PIN itself leaves the server.
    expect(Object.keys(row)).not.toContain("pinHash")
    expect(Object.keys(row)).not.toContain("pinCipher")
  })

  it("reports a one-time link as waiting until it is opened", async () => {
    await issue({ shareLink: true })

    const live = (await list({ status: "ACTIVE" }))[0]!
    expect(live.share).toBe("waiting")

    const summary = (await as(admin, "get", "/admin/pins/summary").expect(200)).body.data
    expect(summary.active).toBeGreaterThanOrEqual(1)
    expect(summary.linksWaiting).toBeGreaterThanOrEqual(1)
    expect(summary.used30d).toBeGreaterThanOrEqual(1)
    expect(summary.issued30d).toBeGreaterThanOrEqual(2)
  })

  it("filters by status and search, and keeps the uid filter", async () => {
    expect(await list({ status: "REVOKED" })).toHaveLength(0)
    expect(await list({ search: "nobody-matches-this" })).toHaveLength(0)

    const byUid = await as(admin, "get", "/admin/pins").query({ uid: client.uid }).expect(200)
    expect(byUid.body.data.items).toHaveLength(2)

    const unknown = await as(admin, "get", "/admin/pins").query({ uid: "zzzzzzzz" }).expect(200)
    expect(unknown.body.data.items).toHaveLength(0)
  })
})
