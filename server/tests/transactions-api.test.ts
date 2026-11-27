import { TxCategory, TxStatus, TxType } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { anon, as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

describe.skipIf(!hasDatabase)("GET /transactions filters and summary", () => {
  let user: Awaited<ReturnType<typeof createTestUser>>
  let other: Awaited<ReturnType<typeof createTestUser>>

  beforeAll(async () => {
    await cleanupTestUsers()
    user = await createTestUser()
    other = await createTestUser()

    const row = (
      userId: string,
      type: TxType,
      category: TxCategory,
      amount: number,
      status: TxStatus,
      createdAt: string,
      description: string
    ) => ({
      userId,
      type,
      category,
      amount: toMoney(amount),
      status,
      createdAt: new Date(createdAt),
      description,
    })

    await testPrisma.transaction.createMany({
      data: [
        row(user.id, TxType.CREDIT, TxCategory.DEPOSIT, 1000, TxStatus.COMPLETED, "2026-10-01T10:00:00Z", "Bank transfer deposit"),
        row(user.id, TxType.CREDIT, TxCategory.PLAN_PAYOUT, 12, TxStatus.COMPLETED, "2026-10-05T10:00:00Z", "Starter plan daily return"),
        row(user.id, TxType.DEBIT, TxCategory.WITHDRAWAL, 105, TxStatus.PENDING, "2026-10-06T10:00:00Z", "Withdrawal via crypto"),
        row(user.id, TxType.DEBIT, TxCategory.WITHDRAWAL, 210, TxStatus.REJECTED, "2026-10-07T10:00:00Z", "Withdrawal via bank"),
        row(user.id, TxType.DEBIT, TxCategory.PLAN_PRINCIPAL, 250, TxStatus.COMPLETED, "2026-10-08T10:00:00Z", "Starter plan subscription"),
        // Someone else's money must never appear in these totals.
        row(other.id, TxType.CREDIT, TxCategory.DEPOSIT, 99999, TxStatus.COMPLETED, "2026-10-02T10:00:00Z", "Bank transfer deposit"),
      ],
    })
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.$disconnect()
  })

  it("requires a session", async () => {
    expect((await anon("get", "/transactions/summary")).status).toBe(401)
  })

  it("sums settled money in and out, and pending separately", async () => {
    const res = await as(user, "get", "/transactions/summary")
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      count: 5,
      moneyIn: "1012.00",
      moneyOut: "250.00",
      pending: { count: 1, amount: "105.00" },
    })
  })

  it("applies the same filters as the list", async () => {
    const query = { category: "WITHDRAWAL" }
    const [list, summary] = await Promise.all([
      as(user, "get", "/transactions").query(query),
      as(user, "get", "/transactions/summary").query(query),
    ])
    expect(list.body.data.items).toHaveLength(2)
    expect(summary.body.data.count).toBe(2)
    expect(summary.body.data.moneyOut).toBe("0.00")
  })

  it("filters by date range, from inclusive and to exclusive", async () => {
    const res = await as(user, "get", "/transactions").query({
      from: "2026-10-05T10:00:00Z",
      to: "2026-10-07T10:00:00Z",
    })
    expect(res.body.data.items.map((tx: { description: string }) => tx.description)).toEqual([
      "Withdrawal via crypto",
      "Starter plan daily return",
    ])
  })

  it("searches descriptions without regard to case", async () => {
    const res = await as(user, "get", "/transactions").query({ q: "STARTER" })
    expect(res.body.data.items).toHaveLength(2)
  })

  it("rejects a malformed date", async () => {
    const res = await as(user, "get", "/transactions").query({ from: "not-a-date" })
    expect(res.status).toBe(400)
  })
})
