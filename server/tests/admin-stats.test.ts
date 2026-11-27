import { TxCategory } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { getStats } from "../src/modules/admin/admin.service.js"
import { subscribe } from "../src/modules/plans/plans.service.js"
import { credit } from "../src/services/ledger.service.js"
import { as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

/**
 * Stats are platform-wide, so each assertion compares before and after one
 * known change. Test files run one at a time, so nothing else moves between.
 */
describe.skipIf(!hasDatabase)("admin stats", () => {
  const planIds: string[] = []

  beforeAll(async () => {
    await cleanupTestUsers()
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.plan.deleteMany({ where: { id: { in: planIds } } })
    await testPrisma.$disconnect()
  })

  const cents = (value: string) => Math.round(Number(value) * 100)

  it("keeps principal in a plan inside client liability", async () => {
    const before = await getStats()
    const user = await createTestUser()
    const plan = await testPrisma.plan.create({
      data: {
        slug: `stats-${Date.now()}`,
        name: "Stats Test",
        dailyReturnBps: 100,
        durationDays: 5,
        minDeposit: 1,
        description: "test",
        features: [],
      },
    })
    planIds.push(plan.id)

    await credit({ userId: user.id, amount: toMoney(1000), category: TxCategory.DEPOSIT })
    await subscribe(user.id, plan.slug, 600)
    const after = await getStats()

    // The deposit raised liability by $1,000. Subscribing moved $600 from
    // cash into a plan without changing what is owed.
    expect(cents(after.ledger.clientLiability) - cents(before.ledger.clientLiability)).toBe(100_000)
    expect(cents(after.ledger.clientCash) - cents(before.ledger.clientCash)).toBe(40_000)
    expect(cents(after.ledger.inPlans) - cents(before.ledger.inPlans)).toBe(60_000)
    expect(after.plans.active - before.plans.active).toBe(1)
    // A 5-day plan matures within the week.
    expect(after.plans.maturingThisWeek - before.plans.maturingThisWeek).toBe(1)
    expect(cents(after.flows.deposits) - cents(before.flows.deposits)).toBe(100_000)
    expect(after.users.newToday - before.users.newToday).toBe(1)

    const today = after.flows.series.at(-1)!
    const todayBefore = before.flows.series.at(-1)!
    expect(cents(today.deposits) - cents(todayBefore.deposits)).toBe(100_000)
    expect(after.flows.series).toHaveLength(30)
  })

  it("is served to admins", async () => {
    const admin = await createTestUser({ role: "ADMIN" })
    const res = await as(admin, "get", "/admin/stats")
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty("ledger.clientLiability")
    expect(res.body.data).toHaveProperty("flows.series")
  })
})
