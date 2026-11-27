import { PinStatus, SubscriptionStatus, TxCategory } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { credit, getBalance } from "../src/services/ledger.service.js"
import { issuePin, listPins, revokePin } from "../src/modules/pins/pins.service.js"
import { getPerformance, getSummary } from "../src/modules/portfolio/portfolio.service.js"
import {
  accruePlanReturns,
  accrualSchedule,
  cancelSubscription,
  serializeSubscription,
  subscribe,
} from "../src/modules/plans/plans.service.js"
import { toMoney } from "../src/lib/money.js"
import { app } from "./helpers/api.js"
import { cleanupTestUsers, createTestUser, hasDatabase, testPrisma } from "./helpers/db.js"

const DAY = 24 * 60 * 60 * 1000
const at = (iso: string) => new Date(iso)
const plus = (date: Date, ms: number) => new Date(date.getTime() + ms)

/* ------------------------------------------------------------- pure rule */

describe("accrualSchedule", () => {
  const start = at("2026-03-01T10:00:00Z")
  const sub = (accruedPeriods = 0) => ({
    startedAt: start,
    endsAt: plus(start, 30 * DAY),
    accruedPeriods,
  })

  it("owes nothing until a full 24 hours have passed", () => {
    expect(accrualSchedule(sub(), plus(start, DAY - 1)).owed).toBe(0)
    expect(accrualSchedule(sub(), plus(start, DAY)).owed).toBe(1)
  })

  it("owes every period missed, minus those already paid", () => {
    expect(accrualSchedule(sub(), plus(start, 3.5 * DAY)).owed).toBe(3)
    expect(accrualSchedule(sub(2), plus(start, 3.5 * DAY)).owed).toBe(1)
  })

  it("never owes more than the term, however late it runs", () => {
    const schedule = accrualSchedule(sub(), plus(start, 400 * DAY))
    expect(schedule).toMatchObject({ totalPeriods: 30, owed: 30, matured: true })
  })

  it("absorbs milliseconds between startedAt and endsAt", () => {
    const drifted = { ...sub(), startedAt: plus(start, 7) }
    expect(accrualSchedule(drifted, plus(start, 30 * DAY))).toMatchObject({
      totalPeriods: 30,
      owed: 30,
      matured: true,
    })
  })

  it("never owes a negative amount when more was paid than is due", () => {
    // The old midnight job could pay a day early; the backfill counts it.
    expect(accrualSchedule(sub(2), plus(start, 1.5 * DAY)).owed).toBe(0)
  })
})

/* ------------------------------------------------------------ against PG */

describe.skipIf(!hasDatabase)("plan accrual", () => {
  const planIds: string[] = []

  beforeAll(async () => {
    await cleanupTestUsers()
  })

  afterAll(async () => {
    await cleanupTestUsers()
    await testPrisma.plan.deleteMany({ where: { id: { in: planIds } } })
    await testPrisma.$disconnect()
  })

  /** A 1.00%/day plan, so $1,000 earns exactly $10.00 a day. */
  async function makeSubscription(opts: {
    startedAt: Date
    durationDays?: number
    principal?: number
  }) {
    const user = await createTestUser()
    const durationDays = opts.durationDays ?? 30
    const plan = await testPrisma.plan.create({
      data: {
        slug: `accrual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "Accrual Test",
        dailyReturnBps: 100,
        durationDays,
        minDeposit: 1,
        description: "test",
        features: [],
      },
    })
    planIds.push(plan.id)

    const subscription = await testPrisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        principal: opts.principal ?? 1000,
        dailyReturnBps: plan.dailyReturnBps,
        startedAt: opts.startedAt,
        endsAt: plus(opts.startedAt, durationDays * DAY),
      },
    })
    return { user, subscription }
  }

  const payouts = (subscriptionId: string) =>
    testPrisma.transaction.findMany({
      where: {
        category: TxCategory.PLAN_PAYOUT,
        metadata: { path: ["subscriptionId"], equals: subscriptionId },
      },
      orderBy: { createdAt: "asc" },
    })

  const reload = (id: string) =>
    testPrisma.subscription.findUniqueOrThrow({ where: { id } })


  it("pays a running subscription the rate it started at, whatever the plan says now", async () => {
    const start = at("2026-04-01T09:00:00Z")
    const { subscription } = await makeSubscription({ startedAt: start, durationDays: 5 })

    // The plan's rate quadruples after signup.
    await testPrisma.plan.update({ where: { id: subscription.planId }, data: { dailyReturnBps: 400 } })
    await accruePlanReturns(plus(start, 2 * DAY))

    const rows = await payouts(subscription.id)
    expect(rows.map((row) => row.amount.toFixed(2))).toEqual(["10.00", "10.00"])

    const view = serializeSubscription(
      await testPrisma.subscription.findUniqueOrThrow({ where: { id: subscription.id }, include: { plan: true } })
    )
    expect(view.dailyReturnPercent).toBe("1.00")
    expect(view.dailyPayout).toBe("10.00")
  })
  it("makes a 23:59 subscriber wait a full day", async () => {
    const start = at("2026-03-01T23:59:00Z")
    const { subscription } = await makeSubscription({ startedAt: start })

    await accruePlanReturns(at("2026-03-02T00:05:00Z"))
    expect(await payouts(subscription.id)).toHaveLength(0)

    await accruePlanReturns(at("2026-03-02T23:59:00Z"))
    expect(await payouts(subscription.id)).toHaveLength(1)
  })

  it("catches up on missed days, each dated to the day it was earned", async () => {
    const start = at("2026-04-01T09:00:00Z")
    const { user, subscription } = await makeSubscription({ startedAt: start })

    await accruePlanReturns(plus(start, 3 * DAY + 5 * 60 * 1000))

    const rows = await payouts(subscription.id)
    expect(rows.map((row) => row.createdAt.toISOString())).toEqual([
      plus(start, DAY).toISOString(),
      plus(start, 2 * DAY).toISOString(),
      plus(start, 3 * DAY).toISOString(),
    ])
    expect(rows.every((row) => row.amount.toFixed(2) === "10.00")).toBe(true)

    const after = await reload(subscription.id)
    expect(after.accruedPeriods).toBe(3)
    expect(after.totalAccrued.toFixed(2)).toBe("30.00")
    expect(after.lastAccruedOn?.toISOString()).toBe(plus(start, 3 * DAY).toISOString())
    expect((await getBalance(user.id)).toFixed(2)).toBe("30.00")
  })

  it("reports the payout schedule a subscriber sees", async () => {
    const start = at("2026-05-01T09:00:00Z")
    const { subscription } = await makeSubscription({ startedAt: start, durationDays: 3 })

    const fresh = serializeSubscription(
      await testPrisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: { plan: true },
      })
    )
    expect(fresh).toMatchObject({ dailyPayout: "10.00", paidPeriods: 0, totalPeriods: 3 })
    expect(fresh.nextPayoutAt?.toISOString()).toBe(plus(start, DAY).toISOString())

    await accruePlanReturns(plus(start, 2 * DAY))
    const midway = serializeSubscription(
      await testPrisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: { plan: true },
      })
    )
    expect(midway.paidPeriods).toBe(2)
    expect(midway.nextPayoutAt?.toISOString()).toBe(plus(start, 3 * DAY).toISOString())

    await accruePlanReturns(plus(start, 3 * DAY))
    const done = serializeSubscription(
      await testPrisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: { plan: true },
      })
    )
    expect(done).toMatchObject({ status: SubscriptionStatus.COMPLETED, paidPeriods: 3, nextPayoutAt: null })
  })

  it("counts principal in active plans toward account value, not balance", async () => {
    const start = at("2026-06-01T09:00:00Z")
    const { user, subscription } = await makeSubscription({ startedAt: start, principal: 2500 })

    const running = await getSummary(user.id)
    expect(running).toMatchObject({ balance: "0.00", inPlans: "2500.00", accountValue: "2500.00" })

    await accruePlanReturns(plus(start, 30 * DAY))
    expect((await reload(subscription.id)).status).toBe(SubscriptionStatus.COMPLETED)

    // 30 days at 1% of $2,500 is $750, and the principal comes back.
    const matured = await getSummary(user.id)
    expect(matured).toMatchObject({ balance: "3250.00", inPlans: "0.00", accountValue: "3250.00" })
  })

  it("charts subscribing as a transfer, not a loss", async () => {
    const user = await createTestUser()
    const plan = await testPrisma.plan.create({
      data: {
        slug: `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: "Chart Test",
        dailyReturnBps: 100,
        durationDays: 30,
        minDeposit: 1,
        description: "test",
        features: [],
      },
    })
    planIds.push(plan.id)

    await credit({ userId: user.id, amount: toMoney(1000), category: TxCategory.DEPOSIT })
    await subscribe(user.id, plan.slug, 600)

    const summary = await getSummary(user.id)
    expect(summary).toMatchObject({ balance: "400.00", inPlans: "600.00", accountValue: "1000.00" })

    const { points } = await getPerformance(user.id, "7d")
    expect(points.at(-1)?.value).toBe(summary.accountValue)
  })

  it("pays nothing more when run twice at the same moment", async () => {
    const start = at("2026-05-01T09:00:00Z")
    const { subscription } = await makeSubscription({ startedAt: start })
    const now = plus(start, 2 * DAY)

    await accruePlanReturns(now)
    await accruePlanReturns(now)

    expect(await payouts(subscription.id)).toHaveLength(2)
  })

  it("pays once when concurrent runs race", async () => {
    const start = at("2026-06-01T09:00:00Z")
    const { user, subscription } = await makeSubscription({ startedAt: start })
    const now = plus(start, 5 * DAY)

    await Promise.all([
      accruePlanReturns(now),
      accruePlanReturns(now),
      accruePlanReturns(now),
    ])

    expect(await payouts(subscription.id)).toHaveLength(5)
    expect((await getBalance(user.id)).toFixed(2)).toBe("50.00")
  })

  it("completes a matured plan with exactly its term in payouts, plus principal", async () => {
    const start = at("2026-01-01T12:00:00Z")
    const { user, subscription } = await makeSubscription({ startedAt: start })

    // Nobody ran the job for the whole term and then some.
    await accruePlanReturns(plus(start, 45 * DAY))

    expect(await payouts(subscription.id)).toHaveLength(30)
    const after = await reload(subscription.id)
    expect(after.status).toBe(SubscriptionStatus.COMPLETED)
    expect(after.totalAccrued.toFixed(2)).toBe("300.00")

    const principal = await testPrisma.transaction.findMany({
      where: {
        category: TxCategory.PLAN_PRINCIPAL,
        metadata: { path: ["subscriptionId"], equals: subscription.id },
      },
    })
    expect(principal).toHaveLength(1)
    expect(principal[0]!.createdAt.toISOString()).toBe(after.endsAt.toISOString())
    expect((await getBalance(user.id)).toFixed(2)).toBe("1300.00")

    // A completed plan is never paid again.
    await accruePlanReturns(plus(start, 60 * DAY))
    expect(await payouts(subscription.id)).toHaveLength(30)
  })

  it("counts a period whose return rounds to $0.00 without writing a credit", async () => {
    const start = at("2026-07-01T09:00:00Z")
    // 1% of $0.40 is $0.004, which rounds to $0.00.
    const { subscription } = await makeSubscription({ startedAt: start, principal: 0.4 })

    await accruePlanReturns(plus(start, 2 * DAY))

    expect(await payouts(subscription.id)).toHaveLength(0)
    expect((await reload(subscription.id)).accruedPeriods).toBe(2)
  })

  it("settles owed periods before cancelling", async () => {
    const start = plus(new Date(), -2.5 * DAY)
    const { user, subscription } = await makeSubscription({ startedAt: start })

    await cancelSubscription(user.id, subscription.id)

    expect(await payouts(subscription.id)).toHaveLength(2)
    expect((await reload(subscription.id)).status).toBe(SubscriptionStatus.CANCELLED)
    // Two days' returns plus the principal back.
    expect((await getBalance(user.id)).toFixed(2)).toBe("1020.00")
  })

  it("completes rather than cancels a plan whose term has already ended", async () => {
    const start = plus(new Date(), -31 * DAY)
    const { user, subscription } = await makeSubscription({ startedAt: start })

    await expect(cancelSubscription(user.id, subscription.id)).rejects.toThrow(
      /already completed/
    )

    expect((await reload(subscription.id)).status).toBe(SubscriptionStatus.COMPLETED)
    expect(await payouts(subscription.id)).toHaveLength(30)
    // Principal returned exactly once, by maturity, not again by a cancel.
    expect((await getBalance(user.id)).toFixed(2)).toBe("1300.00")
  })

  it("never double-pays when a cancel races the job", async () => {
    const start = plus(new Date(), -3.5 * DAY)
    const { user, subscription } = await makeSubscription({ startedAt: start })

    await Promise.allSettled([
      cancelSubscription(user.id, subscription.id),
      accruePlanReturns(),
      accruePlanReturns(),
    ])

    expect(await payouts(subscription.id)).toHaveLength(3)
    expect((await getBalance(user.id)).toFixed(2)).toBe("1030.00")
  })
})

/* ------------------------------------------------------------ PIN expiry */

describe.skipIf(!hasDatabase)("PIN expiry without a job", () => {
  afterAll(async () => {
    await cleanupTestUsers()
  })

  async function lapsedPin() {
    const user = await createTestUser()
    const admin = await createTestUser({ role: "ADMIN" })
    const issued = await issuePin({
      userId: user.id,
      issuedById: admin.id,
      length: 6,
      ttlMinutes: 30,
    })
    await testPrisma.withdrawalPin.update({
      where: { id: issued.id },
      data: { expiresAt: plus(new Date(), -60_000) },
    })
    return { user, admin, issued }
  }

  it("lists a lapsed PIN as EXPIRED", async () => {
    const { user, issued } = await lapsedPin()

    const pins = await listPins(user.id)
    expect(pins.find((pin) => pin.id === issued.id)?.status).toBe(PinStatus.EXPIRED)
  })

  it("does not report revoking a PIN that had already lapsed", async () => {
    const { issued } = await lapsedPin()

    expect(await revokePin(issued.id)).toBeNull()
    const record = await testPrisma.withdrawalPin.findUniqueOrThrow({
      where: { id: issued.id },
    })
    expect(record.status).toBe(PinStatus.EXPIRED)
  })

  it("records a lapsed PIN as EXPIRED, not REVOKED, when a new one is issued", async () => {
    const { user, admin, issued } = await lapsedPin()

    await issuePin({ userId: user.id, issuedById: admin.id, length: 6, ttlMinutes: 30 })

    const record = await testPrisma.withdrawalPin.findUniqueOrThrow({
      where: { id: issued.id },
    })
    expect(record.status).toBe(PinStatus.EXPIRED)
  })
})

/* ---------------------------------------------------------- job endpoint */

describe.skipIf(!hasDatabase)("POST /internal/jobs/accrue-plan-returns", () => {
  const path = "/api/v1/internal/jobs/accrue-plan-returns"

  it("rejects a missing or wrong secret", async () => {
    await request(app()).post(path).expect(401)
    await request(app())
      .post(path)
      .set("Authorization", "Bearer not-the-secret")
      .expect(401)
  })

  it("runs accrual with the right secret", async () => {
    const response = await request(app())
      .post(path)
      .set("Authorization", `Bearer ${process.env.CRON_SECRET}`)
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      processed: expect.any(Number),
      periodsPaid: expect.any(Number),
      credited: expect.any(String),
    })
  })
})
