import { TxCategory } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toMoney } from "../src/lib/money.js"
import { subscribe } from "../src/modules/plans/plans.service.js"
import { credit } from "../src/services/ledger.service.js"
import { as } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

/** The admin plan list: what each plan has running, paid and still owes. */
describe.skipIf(!hasDatabase)("admin plans", () => {
  let admin: Awaited<ReturnType<typeof createTestUser>>
  let planId: string
  const slug = `test-book-${Date.now()}`

  beforeAll(async () => {
    await cleanupTestUsers()
    admin = await createTestUser({ role: "ADMIN" })
    const client = await createTestUser()
    const plan = await testPrisma.plan.create({
      data: {
        slug,
        name: "Book Test",
        dailyReturnBps: 100,
        durationDays: 5,
        minDeposit: 1,
        description: "test",
        features: [],
      },
    })
    planId = plan.id
    await credit({ userId: client.id, amount: toMoney(1000), category: TxCategory.DEPOSIT })
    await subscribe(client.id, slug, 1000)
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.plan.deleteMany({ where: { id: planId } })
    await testPrisma.$disconnect()
  })

  type Row = {
    id: string
    dailyReturnPercent: string
    subscriptions: {
      active: number
      activePrincipal: string
      paidOut: string
      owedToMaturity: string
      maturingThisWeek: number
      onOlderRate: number
    }
  }

  const row = async () => {
    const response = await as(admin, "get", "/admin/plans").expect(200)
    return (response.body.data.plans as Row[]).find((plan) => plan.id === planId)!
  }

  it("reports the running book and what it still owes", async () => {
    const plan = await row()
    expect(plan.subscriptions).toEqual({
      total: 1,
      active: 1,
      activePrincipal: "1000.00",
      paidOut: "0.00",
      // 1% of $1,000 for five days.
      owedToMaturity: "50.00",
      maturingThisWeek: 1,
      onOlderRate: 0,
    })
  })

  it("leaves running subscriptions on their rate when the plan is repriced", async () => {
    await as(admin, "patch", `/admin/plans/${planId}`).send({ dailyReturnBps: 300 }).expect(200)

    const plan = await row()
    expect(plan.dailyReturnPercent).toBe("3.00")
    expect(plan.subscriptions.onOlderRate).toBe(1)
    // Still 1% a day on the running one, not 3%.
    expect(plan.subscriptions.owedToMaturity).toBe("50.00")
  })
})
