import { TxCategory } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { subscribe } from "../src/modules/plans/plans.service.js"
import { credit, getBalanceSnapshot } from "../src/services/ledger.service.js"
import { as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

const DAY = 24 * 60 * 60 * 1000

/** The subscriptions book: filters, summary, catching up a late payout, cancel reasons. */
describe.skipIf(!hasDatabase)("admin subscriptions", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let client: Awaited<ReturnType<typeof createTestUser>>
  let planId: string
  let lateId: string
  let freshId: string
  const slug = `test-subs-${Date.now()}`

  beforeAll(async () => {
    await cleanupTestUsers()
    admin = await createTestUser({ role: "ADMIN" })
    client = await createTestUser()
    const plan = await testPrisma.plan.create({
      data: { slug, name: "Subs Test", dailyReturnBps: 100, durationDays: 30, minDeposit: 1, description: "test", features: [] },
    })
    planId = plan.id
    await credit({ userId: client.id, amount: toMoney(3000), category: TxCategory.DEPOSIT })

    // Started three days ago and never paid: the job "missed" it.
    const late = await subscribe(client.id, slug, 1000)
    const startedAt = new Date(Date.now() - 3 * DAY - 60_000)
    await testPrisma.subscription.update({
      where: { id: late.id },
      data: { startedAt, endsAt: new Date(startedAt.getTime() + 30 * DAY) },
    })
    lateId = late.id

    freshId = (await subscribe(client.id, slug, 500)).id
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.plan.deleteMany({ where: { id: planId } })
    await testPrisma.$disconnect()
  })

  type Row = {
    id: string
    behind: boolean
    unpaidPeriods: number
    paidPeriods: number
    totalPeriods: number
    dailyPayout: string
    owedToMaturity: string
    dailyReturnPercent: string
    planDailyReturnPercent: string
  }

  const list = async (query: Record<string, string>) => {
    const response = await as(admin, "get", "/admin/subscriptions").query({ planId, limit: 100, ...query }).expect(200)
    return response.body.data.items as Row[]
  }

  it("flags a subscription whose payouts are late", async () => {
    const behind = await list({ view: "behind" })
    expect(behind.map((row) => row.id)).toEqual([lateId])
    expect(behind[0]).toMatchObject({
      behind: true,
      unpaidPeriods: 3,
      paidPeriods: 0,
      totalPeriods: 30,
      dailyPayout: "10.00",
      owedToMaturity: "300.00",
    })

    const summary = (await as(admin, "get", "/admin/subscriptions/summary").expect(200)).body.data
    expect(summary.behind).toBeGreaterThanOrEqual(1)
    expect(summary.plans).toContainEqual({ id: planId, name: "Subs Test" })
  })

  it("pays what is owed on request, once", async () => {
    const before = (await getBalanceSnapshot(client.id)).balance

    const first = await as(admin, "post", `/admin/subscriptions/${lateId}/settle`).expect(200)
    expect(first.body.data).toEqual({ periodsPaid: 3, credited: "30.00", matured: false })

    // A second press, or the hourly job landing at the same time, pays nothing.
    const second = await as(admin, "post", `/admin/subscriptions/${lateId}/settle`).expect(200)
    expect(second.body.data.periodsPaid).toBe(0)

    const after = (await getBalanceSnapshot(client.id)).balance
    expect(after.sub(before).toFixed(2)).toBe("30.00")

    expect(await list({ view: "behind" })).toHaveLength(0)
    const audit = await testPrisma.auditLog.findFirst({ where: { action: "subscription.settle", targetId: lateId } })
    expect(audit?.after).toMatchObject({ periodsPaid: 3, credited: "30.00" })
  })

  it("filters by search, maturity window and sort", async () => {
    expect(await list({ search: client.uid })).toHaveLength(2)
    expect(await list({ search: "nobody-matches-this" })).toHaveLength(0)
    expect(await list({ view: "maturing" })).toHaveLength(0)

    const largest = await list({ sort: "largest" })
    expect(largest.map((row) => row.id)).toEqual([lateId, freshId])
  })

  it("records the reason given for a cancellation", async () => {
    await as(admin, "post", `/admin/subscriptions/${freshId}/cancel`).send({ reason: "Client asked by phone" }).expect(200)

    const audit = await testPrisma.auditLog.findFirst({ where: { action: "subscription.cancel", targetId: freshId } })
    expect(audit?.after).toMatchObject({ reason: "Client asked by phone", principalReturned: "500.00" })

    const cancelled = await list({ status: "CANCELLED" })
    expect(cancelled.map((row) => row.id)).toEqual([freshId])

    // Settling a closed subscription is refused, not silently ignored.
    await as(admin, "post", `/admin/subscriptions/${freshId}/settle`).expect(400)
  })

  it("still cancels with no body at all", async () => {
    await as(admin, "post", `/admin/subscriptions/${lateId}/cancel`).expect(200)
  })
})
