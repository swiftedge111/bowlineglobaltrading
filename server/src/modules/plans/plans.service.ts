import {
  Prisma,
  SubscriptionStatus,
  TxCategory,
  type Plan,
  type Subscription,
  type User,
} from "@prisma/client"

import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../lib/errors.js"
import { logger } from "../../lib/logger.js"
import { ZERO, bpsOf, round2, serialize, toMoney, type Money } from "../../lib/money.js"
import type { Pagination } from "../../lib/pagination.js"
import { toSkipTake } from "../../lib/pagination.js"
import { prisma } from "../../lib/prisma.js"
import { recordAudit } from "../../services/audit.service.js"
import {
  sendSubscriptionCancelledEmail,
  sendSubscriptionCompletedEmail,
  sendSubscriptionConfirmedEmail,
} from "../../services/email/email.service.js"
import {
  credit,
  creditMany,
  debit,
  getBalanceSnapshot,
} from "../../services/ledger.service.js"

/** Investment plans and subscriptions. Seeded plan figures mirror the marketing page. */

export function serializePlan(plan: Plan) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    /** e.g. "1.20" — percent per day. */
    dailyReturnPercent: (plan.dailyReturnBps / 100).toFixed(2),
    durationDays: plan.durationDays,
    minDeposit: serialize(plan.minDeposit),
    maxDeposit: plan.maxDeposit ? serialize(plan.maxDeposit) : null,
    referralBonusPercent: plan.referralBonusPercent,
    description: plan.description,
    features: plan.features,
    isPopular: plan.isPopular,
  }
}

export async function listPlans() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  })
  return plans.map(serializePlan)
}

export function serializeSubscription(
  subscription: Subscription & { plan: Plan }
) {
  // `totalPeriods` depends only on the term, so any clock reading will do.
  const { totalPeriods } = accrualSchedule(subscription, subscription.startedAt)
  const paidPeriods = Math.min(subscription.accruedPeriods, totalPeriods)
  const nextPeriod = paidPeriods + 1

  return {
    id: subscription.id,
    plan: serializePlan(subscription.plan),
    principal: serialize(subscription.principal),
    totalAccrued: serialize(subscription.totalAccrued),
    status: subscription.status,
    startedAt: subscription.startedAt,
    endsAt: subscription.endsAt,
    /** The rate this subscription was opened at, e.g. `"2.50"`. */
    dailyReturnPercent: (subscription.dailyReturnBps / 100).toFixed(2),
    /** The fixed amount each period pays, already rounded to cents. */
    dailyPayout: serialize(
      bpsOf(subscription.principal, subscription.dailyReturnBps)
    ),
    paidPeriods,
    totalPeriods,
    /**
     * When the next return is earned. It can be slightly in the past when the
     * hourly job has not run yet; the payout is still owed and will be dated
     * to this moment. Null once the plan has stopped paying.
     */
    nextPayoutAt:
      subscription.status === SubscriptionStatus.ACTIVE && nextPeriod <= totalPeriods
        ? periodEnd(subscription, nextPeriod)
        : null,
  }
}

export async function listSubscriptions(userId: string) {
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  })
  return subscriptions.map(serializeSubscription)
}

/**
 * Subscribing moves capital out of the spendable balance and into the plan.
 * The principal is returned as a credit when the term completes.
 */
export async function subscribe(
  userId: string,
  planSlug: string,
  amountInput: number
): Promise<Subscription & { plan: Plan }> {
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } })
  if (!plan || !plan.isActive) throw new NotFoundError("Plan")

  const principal = round2(toMoney(amountInput))

  if (principal.lessThan(plan.minDeposit)) {
    throw new ValidationError(
      `The ${plan.name} plan requires at least $${serialize(plan.minDeposit)}.`
    )
  }
  if (plan.maxDeposit && principal.greaterThan(plan.maxDeposit)) {
    throw new ValidationError(
      `The ${plan.name} plan accepts at most $${serialize(plan.maxDeposit)}.`
    )
  }

  // Both ends from one clock reading, so the term is exactly durationDays × 24h
  // and `accrualSchedule` pays exactly durationDays periods.
  const startedAt = new Date()
  const endsAt = new Date(startedAt)
  endsAt.setUTCDate(endsAt.getUTCDate() + plan.durationDays)

  const subscription = await prisma.$transaction(
    async (tx) => {
      // Settles immediately — the capital is committed, not merely reserved.
      await debit(
        {
          userId,
          amount: principal,
          category: TxCategory.PLAN_PRINCIPAL,
          description: `${plan.name} plan subscription`,
          metadata: { planSlug: plan.slug },
          status: "COMPLETED",
        },
        tx
      )

      return tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          principal,
          // Locked in: later edits to the plan's rate do not reach this one.
          dailyReturnBps: plan.dailyReturnBps,
          startedAt,
          endsAt,
        },
        include: { plan: true },
      })
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
  )

  // Committing capital is the single largest thing a user does here. Confirm it
  // outside the transaction so a mail failure cannot roll back a settled debit.
  void notifySubscriber(userId, async (user) => {
    const { balance } = await getBalanceSnapshot(userId)

    return sendSubscriptionConfirmedEmail(user, {
      planName: plan.name,
      principal: serialize(principal),
      dailyReturnPercent: (plan.dailyReturnBps / 100).toFixed(2),
      durationDays: plan.durationDays,
      endsAt,
      newBalance: serialize(balance),
    })
  })

  return subscription
}

/**
 * Look the user up and send, swallowing failures.
 *
 * Every plan email is a courtesy on top of a ledger entry that has already
 * settled — none of them may propagate, and none may be awaited by the caller.
 */
function notifySubscriber(
  userId: string,
  send: (user: User) => Promise<void>
): Promise<void> {
  return prisma.user
    .findUnique({ where: { id: userId } })
    .then((user) => (user ? send(user) : undefined))
    .catch((error: unknown) => {
      logger.error({ err: error, userId }, "Plan email failed")
    })
}

export async function cancelSubscription(
  userId: string,
  subscriptionId: string
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  })

  if (!subscription || subscription.userId !== userId) {
    throw new NotFoundError("Subscription")
  }
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw new ValidationError("That subscription is no longer active.")
  }

  const outcome = await prisma.$transaction(async (tx) => {
    /*
     * Settle what is owed before cancelling. Accrual runs on a schedule, so
     * periods can be complete but not yet paid. Without this, cancelling
     * between the end of a period and the next run would forfeit it.
     *
     * If the term has already ended, settling completes the plan and returns
     * the principal. Commit that and report it, rather than cancelling.
     */
    const settled = await accrueSubscription(subscription.id, new Date(), tx)
    if (settled?.matured) return { matured: settled }

    /*
     * Cancel first, refund second — and cancel conditionally.
     *
     * The ACTIVE check above happens outside this transaction, so two taps on
     * Cancel both passed it and both reached `credit()`, which creates a new
     * row per call. The principal came back twice. This one was reachable by
     * any user with a double-tap, not just an admin.
     *
     * Ordering matters as much as the condition: claiming the subscription
     * before crediting means the caller who loses the race has already failed
     * by the time any money would move. Same compare-and-swap as `settle` and
     * `unwind`; `accrueSubscription` below guards itself the same way via
     * `accruedPeriods`.
     */
    const claimed = await tx.subscription.updateMany({
      where: { id: subscription.id, status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.CANCELLED },
    })

    if (claimed.count !== 1) {
      throw new ValidationError("That subscription is no longer active.")
    }

    // Early exit returns the principal; accrued payouts already credited stay.
    await credit(
      {
        userId,
        amount: subscription.principal,
        category: TxCategory.PLAN_PRINCIPAL,
        description: `${subscription.plan.name} plan cancelled — principal returned`,
        metadata: { subscriptionId: subscription.id },
      },
      tx
    )

    return { matured: null }
  })

  if (outcome.matured) {
    sendMaturedEmail(outcome.matured)
    throw new ValidationError(
      "This plan has already completed. Its principal and returns are in your balance."
    )
  }

  void notifySubscriber(userId, async (user) => {
    const { balance } = await getBalanceSnapshot(userId)

    return sendSubscriptionCancelledEmail(user, {
      planName: subscription.plan.name,
      principal: serialize(subscription.principal),
      newBalance: serialize(balance),
    })
  })
}

/* -------------------------------------------------------------- accrual */

const PERIOD_MS = 24 * 60 * 60 * 1000

type Schedulable = Pick<Subscription, "startedAt" | "endsAt" | "accruedPeriods">

/**
 * Where a subscription stands at a given moment.
 *
 * A plan pays once per full 24 hours after `startedAt`. Period k (counting
 * from 1) ends at startedAt + k days, so a 30-day plan pays exactly 30 times.
 * Someone who subscribes at 23:59 waits a full day like everyone else, rather
 * than collecting a day's return at midnight one minute later.
 *
 * `owed` is what a run at `now` must pay. It is derived from the clock and the
 * count already paid. A run that comes late (the server was asleep, deploying
 * or down) therefore pays every period it missed. A second run at the same
 * moment pays nothing.
 */
export function accrualSchedule(
  subscription: Schedulable,
  now: Date
): { totalPeriods: number; duePeriods: number; owed: number; matured: boolean } {
  const start = subscription.startedAt.getTime()
  const end = subscription.endsAt.getTime()

  // Rounded, so a few milliseconds between the two timestamps cannot add or
  // remove a day.
  const totalPeriods = Math.max(0, Math.round((end - start) / PERIOD_MS))
  const matured = now.getTime() >= end
  const elapsed = Math.floor((now.getTime() - start) / PERIOD_MS)
  const duePeriods = matured
    ? totalPeriods
    : Math.min(totalPeriods, Math.max(0, elapsed))

  return {
    totalPeriods,
    duePeriods,
    owed: Math.max(0, duePeriods - subscription.accruedPeriods),
    matured,
  }
}

/** When period `k` ends. The last one ends exactly at `endsAt`. */
function periodEnd(
  subscription: Pick<Subscription, "startedAt" | "endsAt">,
  k: number
): Date {
  return new Date(
    Math.min(
      subscription.startedAt.getTime() + k * PERIOD_MS,
      subscription.endsAt.getTime()
    )
  )
}

interface AccrualOutcome {
  periodsPaid: number
  credited: Money
  matured: boolean
  /** For the completion email, which is sent only after the commit. */
  subscription: Subscription & { plan: Plan }
}

/**
 * Pays what one subscription is owed at `now`, and returns the principal if
 * the term has ended.
 *
 * Returns null when nothing was due, or when a concurrent run got there first.
 * It takes the caller's transaction so `cancelSubscription` can settle what is
 * owed and cancel in a single commit.
 */
async function accrueSubscription(
  subscriptionId: string,
  now: Date,
  tx: Prisma.TransactionClient
): Promise<AccrualOutcome | null> {
  const subscription = await tx.subscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  })
  if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
    return null
  }

  const { duePeriods, owed, matured } = accrualSchedule(subscription, now)
  if (owed === 0 && !matured) return null

  const payout = bpsOf(subscription.principal, subscription.dailyReturnBps)
  const credited = round2(payout.mul(owed))

  // A compare-and-swap on the count already paid, the same guard `cancel`
  // uses on status. Two runs that read the same count cannot both win, and
  // the loser fails here, before any money moves.
  const claimed = await tx.subscription.updateMany({
    where: {
      id: subscription.id,
      status: SubscriptionStatus.ACTIVE,
      accruedPeriods: subscription.accruedPeriods,
    },
    data: {
      accruedPeriods: Math.max(duePeriods, subscription.accruedPeriods),
      ...(owed > 0
        ? {
            lastAccruedOn: periodEnd(subscription, duePeriods),
            totalAccrued: { increment: credited },
          }
        : {}),
      ...(matured ? { status: SubscriptionStatus.COMPLETED } : {}),
    },
  })
  if (claimed.count === 0) return null

  // A principal small enough to round a day's return down to $0.00 still uses
  // up the period. There is just no ledger entry for it.
  if (owed > 0 && payout.greaterThan(0)) {
    const first = subscription.accruedPeriods + 1

    await creditMany(
      Array.from({ length: owed }, (_, index) => {
        const period = first + index
        return {
          userId: subscription.userId,
          amount: payout,
          category: TxCategory.PLAN_PAYOUT,
          description: `${subscription.plan.name} plan daily return`,
          metadata: { subscriptionId: subscription.id, period },
          // Dated to the day it was earned, not the day the job ran.
          createdAt: periodEnd(subscription, period),
        }
      }),
      tx
    )
  }

  if (matured) {
    await credit(
      {
        userId: subscription.userId,
        amount: subscription.principal,
        category: TxCategory.PLAN_PRINCIPAL,
        description: `${subscription.plan.name} plan matured — principal returned`,
        metadata: { subscriptionId: subscription.id },
        createdAt: subscription.endsAt,
      },
      tx
    )
  }

  return { periodsPaid: owed, credited, matured, subscription }
}

function sendMaturedEmail(outcome: AccrualOutcome): void {
  const { subscription } = outcome

  void notifySubscriber(subscription.userId, async (user) => {
    const { balance } = await getBalanceSnapshot(subscription.userId)

    return sendSubscriptionCompletedEmail(user, {
      planName: subscription.plan.name,
      principal: serialize(subscription.principal),
      // `totalAccrued` is the pre-run figure; this run's payouts are the last.
      totalEarned: serialize(subscription.totalAccrued.add(outcome.credited)),
      newBalance: serialize(balance),
    })
  })
}

/**
 * Pays every active subscription what it is owed, and completes those whose
 * term has ended.
 *
 * Safe to run at any time and as often as you like: on a schedule, when the
 * server starts, from the internal job endpoint, or all three at once. Each
 * subscription settles in its own transaction, so one failure cannot stop the
 * rest of the run.
 */
export async function accruePlanReturns(now: Date = new Date()): Promise<{
  processed: number
  periodsPaid: number
  matured: number
  credited: string
}> {
  const candidates = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      OR: [
        { startedAt: { lte: new Date(now.getTime() - PERIOD_MS) } },
        { endsAt: { lte: now } },
      ],
    },
    select: { id: true, startedAt: true, endsAt: true, accruedPeriods: true },
    orderBy: { startedAt: "asc" },
  })

  let processed = 0
  let periodsPaid = 0
  let matured = 0
  let credited = ZERO

  for (const candidate of candidates) {
    // Most rows are already up to date. Skip them without a transaction.
    const schedule = accrualSchedule(candidate, now)
    if (schedule.owed === 0 && !schedule.matured) continue

    try {
      const outcome = await prisma.$transaction(
        (tx) => accrueSubscription(candidate.id, now, tx),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          timeout: 30_000,
        }
      )
      if (!outcome) continue

      processed += 1
      periodsPaid += outcome.periodsPaid
      credited = credited.add(outcome.credited)

      if (outcome.matured) {
        matured += 1
        sendMaturedEmail(outcome)
      }
    } catch (error) {
      logger.error(
        { err: error, subscriptionId: candidate.id },
        "Plan accrual failed"
      )
    }
  }

  return { processed, periodsPaid, matured, credited: serialize(credited) }
}

export async function getAvailableForSubscription(
  userId: string
): Promise<string> {
  const { available } = await getBalanceSnapshot(userId)
  return serialize(available)
}

/* ------------------------------------------------------------------ admin */

/**
 * Plan administration.
 *
 * Plans were seeded once and only changeable with a psql session against
 * production — so altering a headline rate, or retiring a tier, meant hand-
 * editing the table the accrual job reads every night.
 *
 * Two rules the write paths enforce:
 *
 *  - A plan with subscriptions is never deleted, only deactivated. Postgres
 *    would refuse the delete anyway (`onDelete: Restrict`), but failing with a
 *    foreign-key error rather than an explanation is not an answer.
 *  - `dailyReturnBps` and `durationDays` are edited freely and apply to new
 *    subscriptions only. Each subscription stores the rate and end date it
 *    started with, so a running one is paid exactly what it was promised.
 */

/** Everything, including retired tiers — the admin list must show both. */
export async function adminListPlans() {
  const plans = await prisma.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { subscriptions: true } },
    },
  })

  const [running, paid] = await Promise.all([
    prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE },
      select: {
        planId: true,
        principal: true,
        dailyReturnBps: true,
        startedAt: true,
        endsAt: true,
        accruedPeriods: true,
      },
    }),
    prisma.subscription.groupBy({
      by: ["planId"],
      _sum: { totalAccrued: true },
    }),
  ])

  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  return plans.map((plan) => {
    const live = running.filter((subscription) => subscription.planId === plan.id)
    let principal = ZERO
    let owed = ZERO
    let maturingThisWeek = 0
    let onOlderRate = 0

    for (const subscription of live) {
      principal = principal.add(subscription.principal)
      // What is still to be paid out before each running book matures.
      const { totalPeriods } = accrualSchedule(subscription, subscription.startedAt)
      const remaining = Math.max(0, totalPeriods - subscription.accruedPeriods)
      owed = owed.add(bpsOf(subscription.principal, subscription.dailyReturnBps).mul(remaining))
      if (subscription.endsAt <= weekAhead) maturingThisWeek += 1
      if (subscription.dailyReturnBps !== plan.dailyReturnBps) onOlderRate += 1
    }

    return {
      ...serializePlan(plan),
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
      subscriptions: {
        total: plan._count.subscriptions,
        active: live.length,
        activePrincipal: serialize(round2(principal)),
        /** Returns paid to date, across every subscription ever. */
        paidOut: serialize(paid.find((row) => row.planId === plan.id)?._sum.totalAccrued ?? ZERO),
        /** Returns still due to running subscriptions before they mature. */
        owedToMaturity: serialize(round2(owed)),
        maturingThisWeek,
        /** Running subscriptions locked at a rate the plan no longer offers. */
        onOlderRate,
      },
    }
  })
}

export interface PlanInput {
  slug: string
  name: string
  dailyReturnBps: number
  durationDays: number
  minDeposit: number
  maxDeposit?: number | null | undefined
  referralBonusPercent: number
  description: string
  features: string[]
  isPopular: boolean
  isActive: boolean
  sortOrder: number
}

/** Shared by create and update — the invariants hold in both directions. */
function assertPlanShape(input: {
  minDeposit: Money
  maxDeposit: Money | null
}): void {
  if (input.maxDeposit && input.maxDeposit.lessThan(input.minDeposit)) {
    throw new ValidationError(
      "The maximum deposit cannot be below the minimum deposit."
    )
  }
}

export async function createPlan(params: {
  input: PlanInput
  adminId: string
  ip?: string | undefined
}) {
  const { input } = params

  const minDeposit = round2(toMoney(input.minDeposit))
  const maxDeposit =
    input.maxDeposit === null || input.maxDeposit === undefined
      ? null
      : round2(toMoney(input.maxDeposit))

  assertPlanShape({ minDeposit, maxDeposit })

  const existing = await prisma.plan.findUnique({ where: { slug: input.slug } })
  if (existing) {
    throw new ConflictError(`A plan with the slug "${input.slug}" already exists.`)
  }

  const plan = await prisma.plan.create({
    data: {
      slug: input.slug,
      name: input.name,
      dailyReturnBps: input.dailyReturnBps,
      durationDays: input.durationDays,
      minDeposit,
      maxDeposit,
      referralBonusPercent: input.referralBonusPercent,
      description: input.description,
      features: input.features,
      isPopular: input.isPopular,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    },
  })

  await recordAudit({
    actorId: params.adminId,
    action: "plan.create",
    targetType: "Plan",
    targetId: plan.id,
    after: { slug: plan.slug, name: plan.name, dailyReturnBps: plan.dailyReturnBps },
    ip: params.ip,
  })

  return serializePlan(plan)
}

export async function updatePlan(params: {
  planId: string
  input: Partial<PlanInput>
  adminId: string
  ip?: string | undefined
}) {
  const existing = await prisma.plan.findUnique({ where: { id: params.planId } })
  if (!existing) throw new NotFoundError("Plan")

  const { input } = params

  const minDeposit =
    input.minDeposit === undefined
      ? existing.minDeposit
      : round2(toMoney(input.minDeposit))

  const maxDeposit =
    input.maxDeposit === undefined
      ? existing.maxDeposit
      : input.maxDeposit === null
        ? null
        : round2(toMoney(input.maxDeposit))

  assertPlanShape({ minDeposit, maxDeposit })

  // The slug is the public identifier a subscription is created against, so a
  // collision has to be caught before the unique index turns it into a 500.
  if (input.slug && input.slug !== existing.slug) {
    const clash = await prisma.plan.findUnique({ where: { slug: input.slug } })
    if (clash) {
      throw new ConflictError(`A plan with the slug "${input.slug}" already exists.`)
    }
  }

  const plan = await prisma.plan.update({
    where: { id: params.planId },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.dailyReturnBps !== undefined
        ? { dailyReturnBps: input.dailyReturnBps }
        : {}),
      ...(input.durationDays !== undefined
        ? { durationDays: input.durationDays }
        : {}),
      ...(input.minDeposit !== undefined ? { minDeposit } : {}),
      ...(input.maxDeposit !== undefined ? { maxDeposit } : {}),
      ...(input.referralBonusPercent !== undefined
        ? { referralBonusPercent: input.referralBonusPercent }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.features !== undefined ? { features: input.features } : {}),
      ...(input.isPopular !== undefined ? { isPopular: input.isPopular } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  })

  await recordAudit({
    actorId: params.adminId,
    action: "plan.update",
    targetType: "Plan",
    targetId: plan.id,
    before: {
      slug: existing.slug,
      dailyReturnBps: existing.dailyReturnBps,
      durationDays: existing.durationDays,
      minDeposit: serialize(existing.minDeposit),
      isActive: existing.isActive,
    },
    after: {
      slug: plan.slug,
      dailyReturnBps: plan.dailyReturnBps,
      durationDays: plan.durationDays,
      minDeposit: serialize(plan.minDeposit),
      isActive: plan.isActive,
    },
    ip: params.ip,
  })

  return serializePlan(plan)
}

/**
 * Retires a plan. Deletes it outright only if nothing was ever subscribed —
 * otherwise it is deactivated, because the subscriptions that reference it are
 * still being paid and still need its rate.
 */
export async function retirePlan(params: {
  planId: string
  adminId: string
  ip?: string | undefined
}): Promise<{ deleted: boolean }> {
  const plan = await prisma.plan.findUnique({
    where: { id: params.planId },
    include: { _count: { select: { subscriptions: true } } },
  })
  if (!plan) throw new NotFoundError("Plan")

  const deletable = plan._count.subscriptions === 0

  if (deletable) {
    await prisma.plan.delete({ where: { id: plan.id } })
  } else {
    await prisma.plan.update({
      where: { id: plan.id },
      data: { isActive: false },
    })
  }

  await recordAudit({
    actorId: params.adminId,
    action: deletable ? "plan.delete" : "plan.deactivate",
    targetType: "Plan",
    targetId: plan.id,
    before: { slug: plan.slug, isActive: plan.isActive },
    after: { deleted: deletable, subscriptions: plan._count.subscriptions },
    ip: params.ip,
  })

  return { deleted: deletable }
}

/** Every subscription on the platform, newest first. */
export const SUBSCRIPTION_SORTS = ["newest", "ending", "largest"] as const
export type SubscriptionSort = (typeof SUBSCRIPTION_SORTS)[number]

export const SUBSCRIPTION_VIEWS = ["maturing", "behind"] as const
export type SubscriptionView = (typeof SUBSCRIPTION_VIEWS)[number]

/** How long a payout may sit unpaid before the list calls it late. */
const LATE_MS = 2 * 60 * 60 * 1000
const WEEK_MS = 7 * PERIOD_MS

/**
 * Running subscriptions whose next payout, or maturity, is overdue by more
 * than `LATE_MS`. The hourly job should never leave one here; when it does,
 * the job is not running or one subscription keeps failing.
 *
 * Period k ends k days after `startedAt`, and `lastAccruedOn` is the end of
 * the last paid one, so the next is due a day after it (or a day after the
 * start, before the first payout).
 */
function behindWhere(now: Date): Prisma.SubscriptionWhereInput {
  const cutoff = new Date(now.getTime() - LATE_MS - PERIOD_MS)
  return {
    status: SubscriptionStatus.ACTIVE,
    OR: [
      { lastAccruedOn: { lt: cutoff } },
      { lastAccruedOn: null, startedAt: { lt: cutoff } },
      { endsAt: { lt: new Date(now.getTime() - LATE_MS) } },
    ],
  }
}

function subscriptionWhere(params: {
  status?: SubscriptionStatus | undefined
  view?: SubscriptionView | undefined
  planId?: string | undefined
  search?: string | undefined
  now: Date
}): Prisma.SubscriptionWhereInput {
  const and: Prisma.SubscriptionWhereInput[] = []

  if (params.view === "behind") and.push(behindWhere(params.now))
  else if (params.view === "maturing") {
    and.push({
      status: SubscriptionStatus.ACTIVE,
      endsAt: { lte: new Date(params.now.getTime() + WEEK_MS) },
    })
  } else if (params.status) and.push({ status: params.status })

  if (params.planId) and.push({ planId: params.planId })

  if (params.search) {
    const contains = { contains: params.search, mode: "insensitive" as const }
    and.push({
      OR: [
        { id: params.search },
        { user: { fullName: contains } },
        { user: { email: contains } },
        { user: { uid: contains } },
      ],
    })
  }

  return and.length ? { AND: and } : {}
}

const SUBSCRIPTION_ORDER: Record<SubscriptionSort, Prisma.SubscriptionOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }],
  ending: [{ endsAt: "asc" }, { createdAt: "asc" }],
  largest: [{ principal: "desc" }, { createdAt: "desc" }],
}

/** What a running subscription still has to pay before it matures. */
function owedToMaturity(subscription: Subscription) {
  if (subscription.status !== SubscriptionStatus.ACTIVE) return ZERO
  const { totalPeriods } = accrualSchedule(subscription, subscription.startedAt)
  const remaining = Math.max(0, totalPeriods - subscription.accruedPeriods)
  return round2(bpsOf(subscription.principal, subscription.dailyReturnBps).mul(remaining))
}

function serializeAdminSubscription(
  subscription: Subscription & {
    plan: Plan
    user: { uid: string; email: string; fullName: string }
  },
  now: Date
) {
  const base = serializeSubscription(subscription)
  const active = subscription.status === SubscriptionStatus.ACTIVE
  const { owed } = accrualSchedule(subscription, now)
  const late = active && base.nextPayoutAt !== null
    ? now.getTime() - base.nextPayoutAt.getTime() > LATE_MS
    : false
  const overdueMaturity = active && now.getTime() - subscription.endsAt.getTime() > LATE_MS

  return {
    id: subscription.id,
    user: subscription.user,
    planId: subscription.plan.id,
    planName: subscription.plan.name,
    planSlug: subscription.plan.slug,
    principal: base.principal,
    totalAccrued: base.totalAccrued,
    status: subscription.status,
    startedAt: subscription.startedAt,
    endsAt: subscription.endsAt,
    lastAccruedOn: subscription.lastAccruedOn,
    /** When it stopped: the maturity date, or the moment it was cancelled. */
    closedAt:
      subscription.status === SubscriptionStatus.COMPLETED
        ? subscription.endsAt
        : subscription.status === SubscriptionStatus.CANCELLED
          ? subscription.updatedAt
          : null,
    dailyReturnPercent: base.dailyReturnPercent,
    /** What the plan offers new signups today; differs after a reprice. */
    planDailyReturnPercent: (subscription.plan.dailyReturnBps / 100).toFixed(2),
    dailyPayout: base.dailyPayout,
    paidPeriods: base.paidPeriods,
    totalPeriods: base.totalPeriods,
    nextPayoutAt: base.nextPayoutAt,
    owedToMaturity: serialize(owedToMaturity(subscription)),
    /** Periods already earned but not yet paid. Normally 0, briefly 1. */
    unpaidPeriods: active ? owed : 0,
    /** Payout or maturity overdue by more than two hours. */
    behind: late || overdueMaturity,
  }
}

export async function adminListSubscriptions(params: {
  pagination: Pagination
  status?: SubscriptionStatus | undefined
  view?: SubscriptionView | undefined
  planId?: string | undefined
  search?: string | undefined
  sort?: SubscriptionSort | undefined
  now?: Date
}) {
  const now = params.now ?? new Date()
  const where = subscriptionWhere({ ...params, now })

  const [items, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        user: { select: { uid: true, email: true, fullName: true } },
      },
      orderBy: SUBSCRIPTION_ORDER[params.sort ?? "newest"],
      ...toSkipTake(params.pagination),
    }),
    prisma.subscription.count({ where }),
  ])

  return {
    items: items.map((subscription) => serializeAdminSubscription(subscription, now)),
    total,
  }
}

/**
 * The book at a glance: what is running, what it pays a day, what it still
 * owes, what comes due this week, and whether accrual is keeping up.
 */
export async function adminSubscriptionSummary(now: Date = new Date()) {
  const weekAhead = new Date(now.getTime() + WEEK_MS)
  const monthAgo = new Date(now.getTime() - 30 * PERIOD_MS)

  const [running, behind, completed30d, cancelled30d, plans] = await Promise.all([
    prisma.subscription.findMany({ where: { status: SubscriptionStatus.ACTIVE } }),
    prisma.subscription.count({ where: behindWhere(now) }),
    prisma.subscription.count({
      where: { status: SubscriptionStatus.COMPLETED, endsAt: { gte: monthAgo } },
    }),
    prisma.subscription.count({
      where: { status: SubscriptionStatus.CANCELLED, updatedAt: { gte: monthAgo } },
    }),
    prisma.plan.findMany({
      where: { subscriptions: { some: {} } },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ])

  let principal = ZERO
  let daily = ZERO
  let owed = ZERO
  const maturing = { count: 0, principal: ZERO, returns: ZERO }

  for (const subscription of running) {
    const remaining = owedToMaturity(subscription)
    principal = principal.add(subscription.principal)
    daily = daily.add(bpsOf(subscription.principal, subscription.dailyReturnBps))
    owed = owed.add(remaining)
    if (subscription.endsAt <= weekAhead) {
      maturing.count += 1
      maturing.principal = maturing.principal.add(subscription.principal)
      maturing.returns = maturing.returns.add(remaining)
    }
  }

  return {
    active: {
      count: running.length,
      principal: serialize(round2(principal)),
      dailyPayout: serialize(round2(daily)),
      owedToMaturity: serialize(round2(owed)),
    },
    maturing7d: {
      count: maturing.count,
      principal: serialize(round2(maturing.principal)),
      returns: serialize(round2(maturing.returns)),
    },
    behind,
    completed30d,
    cancelled30d,
    plans,
  }
}

/**
 * Pays one subscription everything it has earned, now, instead of waiting
 * for the hourly job. The same guarded path the job takes, so running both at
 * once still pays each period once.
 */
export async function adminSettleSubscription(params: {
  subscriptionId: string
  adminId: string
  ip?: string | undefined
}) {
  const subscription = await prisma.subscription.findUnique({
    where: { id: params.subscriptionId },
  })
  if (!subscription) throw new NotFoundError("Subscription")
  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw new ValidationError("That subscription is no longer active.")
  }

  const outcome = await prisma.$transaction(
    (tx) => accrueSubscription(subscription.id, new Date(), tx),
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30_000 }
  )

  if (!outcome) {
    return { periodsPaid: 0, credited: "0.00", matured: false }
  }
  if (outcome.matured) sendMaturedEmail(outcome)

  await recordAudit({
    actorId: params.adminId,
    action: "subscription.settle",
    targetType: "Subscription",
    targetId: subscription.id,
    after: {
      userId: subscription.userId,
      periodsPaid: outcome.periodsPaid,
      credited: serialize(outcome.credited),
      matured: outcome.matured,
    },
    ip: params.ip,
  })

  return {
    periodsPaid: outcome.periodsPaid,
    credited: serialize(outcome.credited),
    matured: outcome.matured,
  }
}

/**
 * Cancels on the user's behalf, returning the principal exactly as a
 * self-service cancellation does — the same ledger entry, the same email. The
 * only difference is who pressed the button, which the audit log records.
 */
export async function adminCancelSubscription(params: {
  subscriptionId: string
  adminId: string
  reason?: string | undefined
  ip?: string | undefined
}): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: params.subscriptionId },
  })
  if (!subscription) throw new NotFoundError("Subscription")

  await cancelSubscription(subscription.userId, subscription.id)

  await recordAudit({
    actorId: params.adminId,
    action: "subscription.cancel",
    targetType: "Subscription",
    targetId: subscription.id,
    after: {
      userId: subscription.userId,
      principalReturned: serialize(subscription.principal),
      ...(params.reason ? { reason: params.reason } : {}),
    },
    ip: params.ip,
  })
}
