import {
  type Prisma,
  RequestStatus,
  Role,
  SubscriptionStatus,
  TxCategory,
  TxStatus,
  TxType,
  UserStatus,
  type Holding,
} from "@prisma/client"

import {
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
} from "../../lib/errors.js"
import { logger } from "../../lib/logger.js"
import { ZERO, round2, serialize, toMoney } from "../../lib/money.js"
import type { Pagination } from "../../lib/pagination.js"
import { toSkipTake } from "../../lib/pagination.js"
import { prisma } from "../../lib/prisma.js"
import { recordAudit } from "../../services/audit.service.js"
import {
  sendAccountCreditedEmail,
  sendAccountReactivatedEmail,
  sendAccountSuspendedEmail,
  sendAccountDebitedEmail,
  sendHoldingAddedEmail,
  sendProfitCreditedEmail,
} from "../../services/email/email.service.js"
import {
  credit,
  debit,
  getBalanceSnapshot,
  type Db,
} from "../../services/ledger.service.js"
import { serializeSubscription } from "../plans/plans.service.js"

/** Admin operations exposed through routes gated by requireAdmin. */

export const USER_SORTS = ["newest", "oldest", "lastSeen", "name"] as const
export type UserSort = (typeof USER_SORTS)[number]

const userOrder: Record<UserSort, Prisma.UserOrderByWithRelationInput[]> = {
  newest: [{ createdAt: "desc" }, { id: "desc" }],
  oldest: [{ createdAt: "asc" }, { id: "asc" }],
  // Never-seen accounts sink to the bottom rather than leading the list.
  lastSeen: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
  name: [{ fullName: "asc" }, { id: "asc" }],
}

export async function listUsers(params: {
  pagination: Pagination
  search?: string | undefined
  status?: UserStatus | undefined
  role?: Role | undefined
  sort?: UserSort | undefined
}) {
  const search = params.search?.trim()

  const where: Prisma.UserWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    ...(params.role ? { role: params.role } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { username: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
            // Support staff can search by a partial UID in either case.
            { uid: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: userOrder[params.sort ?? "newest"],
      ...toSkipTake(params.pagination),
    }),
    prisma.user.count({ where }),
  ])

  // Balances for the page in one grouped query rather than N round-trips.
  const ids = users.map((user) => user.id)
  const buckets = ids.length
    ? await prisma.transaction.groupBy({
        by: ["userId", "type", "status"],
        where: {
          userId: { in: ids },
          status: { in: [TxStatus.COMPLETED, TxStatus.PENDING] },
        },
        _sum: { amount: true },
      })
    : []

  const planSums = ids.length
    ? await prisma.subscription.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: SubscriptionStatus.ACTIVE },
        _sum: { principal: true },
      })
    : []
  const inPlans = new Map(
    planSums.map((row) => [row.userId, serialize(round2(row._sum.principal ?? ZERO))])
  )

  const balances = new Map<string, { balance: string; available: string }>()
  for (const id of ids) {
    const rows = buckets.filter((bucket) => bucket.userId === id)
    const find = (type: TxType, status: TxStatus) =>
      rows.find((row) => row.type === type && row.status === status)?._sum
        .amount ?? ZERO

    const balance = round2(
      find(TxType.CREDIT, TxStatus.COMPLETED).sub(
        find(TxType.DEBIT, TxStatus.COMPLETED)
      )
    )
    const available = round2(balance.sub(find(TxType.DEBIT, TxStatus.PENDING)))
    balances.set(id, {
      balance: serialize(balance),
      available: serialize(available),
    })
  }

  return {
    items: users.map((user) => ({
      id: user.id,
      uid: user.uid,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      contactPhone: user.contactPhone,
      country: user.country,
      signupIp: user.signupIp,
      signupCountry: user.signupCountry,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      emailVerified: user.emailVerifiedAt !== null,
      balance: balances.get(user.id)?.balance ?? "0.00",
      available: balances.get(user.id)?.available ?? "0.00",
      inPlans: inPlans.get(user.id) ?? "0.00",
    })),
    total,
  }
}

/** Counts behind the Users screen tabs. Clients only, except `admins`. */
export async function getUserCounts(now = new Date()) {
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const client = { role: Role.USER }
  const [clients, active, suspended, unverified, newThisWeek, admins] =
    await Promise.all([
      prisma.user.count({ where: client }),
      prisma.user.count({ where: { ...client, status: UserStatus.ACTIVE } }),
      prisma.user.count({ where: { ...client, status: UserStatus.SUSPENDED } }),
      prisma.user.count({ where: { ...client, emailVerifiedAt: null } }),
      prisma.user.count({ where: { ...client, createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { role: Role.ADMIN } }),
    ])
  return { clients, active, suspended, unverified, newThisWeek, admins }
}

export async function getUserDetail(uid: string) {
  const user = await prisma.user.findUnique({
    where: { uid },
    include: {
      holdings: { where: { archivedAt: null }, orderBy: { createdAt: "desc" } },
      subscriptions: { include: { plan: true }, orderBy: { createdAt: "desc" } },
    },
  })

  if (!user) throw new NotFoundError("User")

  const [snapshot, recentTransactions, lifetime, pendingDeposits, pendingWithdrawals] =
    await Promise.all([
      getBalanceSnapshot(user.id),
      prisma.transaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.transaction.groupBy({
        by: ["category", "type"],
        where: { userId: user.id, status: TxStatus.COMPLETED },
        _sum: { amount: true },
      }),
      prisma.depositRequest.findMany({
        where: { userId: user.id, status: RequestStatus.PENDING },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, method: true, createdAt: true },
      }),
      prisma.withdrawalRequest.findMany({
        where: { userId: user.id, status: RequestStatus.PENDING },
        orderBy: { createdAt: "asc" },
        select: { id: true, amount: true, feeAmount: true, method: true, createdAt: true },
      }),
    ])

  // Net of reversals: an admin debit against a category undoes its credit.
  const net = (...categories: TxCategory[]) =>
    lifetime
      .filter((row) => categories.includes(row.category))
      .reduce(
        (sum, row) =>
          row.type === TxType.CREDIT
            ? sum.add(row._sum.amount ?? ZERO)
            : sum.sub(row._sum.amount ?? ZERO),
        ZERO
      )
  const withdrawn = lifetime
    .filter((row) => row.category === TxCategory.WITHDRAWAL)
    .reduce(
      (sum, row) =>
        row.type === TxType.DEBIT
          ? sum.add(row._sum.amount ?? ZERO)
          : sum.sub(row._sum.amount ?? ZERO),
      ZERO
    )
  const inPlans = user.subscriptions
    .filter((subscription) => subscription.status === SubscriptionStatus.ACTIVE)
    .reduce((sum, subscription) => sum.add(subscription.principal), ZERO)

  return {
    user: {
      id: user.id,
      uid: user.uid,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      contactPhone: user.contactPhone,
      country: user.country,
      signupIp: user.signupIp,
      signupCountry: user.signupCountry,
      emailVerified: user.emailVerifiedAt !== null,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
      createdAt: user.createdAt,
    },
    balance: {
      balance: serialize(snapshot.balance),
      available: serialize(snapshot.available),
      reserved: serialize(snapshot.reserved),
      inPlans: serialize(round2(inPlans)),
      accountValue: serialize(round2(snapshot.balance.add(inPlans))),
    },
    lifetime: {
      deposited: serialize(round2(net(TxCategory.DEPOSIT, TxCategory.HOLDING))),
      /** What left the account, fees included. */
      withdrawn: serialize(round2(withdrawn)),
      earned: serialize(round2(net(TxCategory.PLAN_PAYOUT, TxCategory.PROFIT))),
    },
    pending: {
      deposits: pendingDeposits.map((request) => ({
        id: request.id,
        amount: serialize(request.amount),
        method: request.method,
        createdAt: request.createdAt,
      })),
      withdrawals: pendingWithdrawals.map((request) => ({
        id: request.id,
        amount: serialize(request.amount),
        fee: serialize(request.feeAmount),
        method: request.method,
        createdAt: request.createdAt,
      })),
    },
    holdings: user.holdings.map(serializeHolding),
    subscriptions: user.subscriptions.map((subscription) => {
      const view = serializeSubscription(subscription)
      return {
        id: view.id,
        planName: subscription.plan.name,
        principal: view.principal,
        totalAccrued: view.totalAccrued,
        status: view.status,
        startedAt: view.startedAt,
        endsAt: view.endsAt,
        dailyPayout: view.dailyPayout,
        paidPeriods: view.paidPeriods,
        totalPeriods: view.totalPeriods,
        nextPayoutAt: view.nextPayoutAt,
      }
    }),
    recentTransactions: recentTransactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      category: tx.category,
      amount: serialize(tx.amount),
      status: tx.status,
      description: tx.description,
      createdAt: tx.createdAt,
    })),
  }
}

function serializeHolding(holding: Holding) {
  return {
    id: holding.id,
    name: holding.name,
    symbol: holding.symbol,
    units: holding.units.toString(),
    valueUsd: serialize(holding.valueUsd),
    createdAt: holding.createdAt,
  }
}

export async function setUserStatus(params: {
  uid: string
  status: UserStatus
  adminId: string
  ip?: string | undefined
}) {
  const user = await prisma.user.findUnique({ where: { uid: params.uid } })
  if (!user) throw new NotFoundError("User")

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { status: params.status },
  })

  await recordAudit({
    actorId: params.adminId,
    action: "user.status.change",
    targetType: "User",
    targetId: user.id,
    before: { status: user.status },
    after: { status: params.status },
    ip: params.ip,
  })

  // Losing access to an account holding your money without being told is the
  // kind of silence that turns into a chargeback. Only mail on an actual
  // transition — re-saving the same status should not re-notify.
  if (updated.status !== user.status) {
    const notice =
      updated.status === UserStatus.SUSPENDED
        ? sendAccountSuspendedEmail(updated, null)
        : user.status === UserStatus.SUSPENDED &&
            updated.status === UserStatus.ACTIVE
          ? sendAccountReactivatedEmail(updated)
          : null

    void notice?.catch((error: unknown) => {
      logger.error({ err: error }, "Account status email failed")
    })
  }

  return updated
}

/** Post a manual credit or debit to the account ledger. */
export async function createAdjustment(params: {
  uid: string
  direction: "credit" | "debit"
  amount: number
  category: TxCategory
  description?: string | undefined
  adminId: string
  ip?: string | undefined
  notify?: boolean | undefined
}) {
  const user = await prisma.user.findUnique({ where: { uid: params.uid } })
  if (!user) throw new NotFoundError("User")

  const amount = round2(toMoney(params.amount))
  if (!amount.greaterThan(0)) {
    throw new ValidationError("Amount must be greater than zero.")
  }

  const transaction =
    params.direction === "credit"
      ? await credit({
          userId: user.id,
          amount,
          category: params.category,
          description: params.description ?? undefined,
          processedById: params.adminId,
        })
      : await debit({
          userId: user.id,
          amount,
          category: params.category,
          description: params.description ?? undefined,
          processedById: params.adminId,
          status: TxStatus.COMPLETED,
        })

  await recordAudit({
    actorId: params.adminId,
    action: `adjustment.${params.direction}`,
    targetType: "User",
    targetId: user.id,
    after: {
      transactionId: transaction.id,
      amount: serialize(amount),
      category: params.category,
      description: params.description ?? null,
    },
    ip: params.ip,
  })

  const snapshot = await getBalanceSnapshot(user.id)

  // The two directions default differently, on purpose. Money arriving is news
  // the user wants, so a credit notifies unless silenced. Money leaving is
  // usually an admin correcting their own slip moments later, and mailing about
  // that turns a quiet fix into an alarming one — so a debit stays silent
  // unless the admin explicitly asks for it, per entry.
  const notifying =
    params.direction === "credit"
      ? params.notify !== false
      : params.notify === true

  if (params.direction === "debit" && notifying) {
    void sendAccountDebitedEmail(
      user,
      serialize(amount),
      params.description ?? null,
      serialize(snapshot.balance)
    ).catch((error: unknown) => {
      logger.error({ err: error }, "Account debited email failed")
    })
  }

  if (params.direction === "credit" && notifying) {
    // Profit gets its own words. Earning a return and having a mistyped figure
    // corrected used to arrive as the same "Your account has been credited",
    // which made the one thing the platform sells indistinguishable from
    // routine bookkeeping.
    const earned =
      params.category === TxCategory.PROFIT ||
      params.category === TxCategory.PLAN_PAYOUT

    const notice = earned
      ? sendProfitCreditedEmail(
          user,
          serialize(amount),
          params.description ?? null,
          serialize(snapshot.balance)
        )
      : sendAccountCreditedEmail(
          user,
          serialize(amount),
          params.description ?? null,
          serialize(snapshot.balance)
        )

    void notice.catch((error: unknown) => {
      logger.error({ err: error }, "Account credited email failed")
    })
  }

  return {
    transaction: {
      id: transaction.id,
      type: transaction.type,
      category: transaction.category,
      amount: serialize(transaction.amount),
      status: transaction.status,
      createdAt: transaction.createdAt,
    },
    balance: serialize(snapshot.balance),
    available: serialize(snapshot.available),
  }
}

/** Record a holding and optionally credit the ledger for its value. */
export async function addHolding(params: {
  uid: string
  name: string
  symbol: string
  units: number
  valueUsd: number
  creditLedger: boolean
  adminId: string
  ip?: string | undefined
}) {
  const user = await prisma.user.findUnique({ where: { uid: params.uid } })
  if (!user) throw new NotFoundError("User")

  const valueUsd = round2(toMoney(params.valueUsd))
  if (valueUsd.lessThan(0)) {
    throw new ValidationError("Holding value cannot be negative.")
  }

  // Whether this booking moves money. Decided once, so the audit trail and the
  // notification cannot disagree with what the ledger actually did.
  const credited = params.creditLedger && valueUsd.greaterThan(0)

  const holding = await prisma.$transaction(async (tx) => {
    const record = await tx.holding.create({
      data: {
        userId: user.id,
        name: params.name,
        symbol: params.symbol.toUpperCase(),
        units: toMoney(params.units),
        valueUsd,
      },
    })

    if (credited) {
      await credit(
        {
          userId: user.id,
          amount: valueUsd,
          category: TxCategory.HOLDING,
          description: `${params.name} position added`,
          metadata: { holdingId: record.id, symbol: record.symbol },
          processedById: params.adminId,
        },
        tx
      )
    }

    return record
  })

  await recordAudit({
    actorId: params.adminId,
    action: "holding.create",
    targetType: "Holding",
    targetId: holding.id,
    after: {
      userId: user.id,
      symbol: holding.symbol,
      valueUsd: serialize(valueUsd),
      creditedLedger: credited,
    },
    ip: params.ip,
  })

  // Only when money actually moved. Most positions booked here are a manual
  // payment the desk is recording on the user's behalf — and those users are
  // the least likely to open the dashboard and notice, so silence was the
  // wrong default. Recording an asset the account was never funded for stays
  // silent: nothing happened to their money.
  //
  // Fire-and-forget after the commit, like every other notification here: a
  // mail outage must never roll back a settled ledger entry.
  if (credited) {
    const snapshot = await getBalanceSnapshot(user.id)

    void sendHoldingAddedEmail(user, {
      name: holding.name,
      symbol: holding.symbol,
      units: holding.units.toString(),
      valueUsd: serialize(valueUsd),
      newBalance: serialize(snapshot.balance),
    }).catch((error: unknown) => {
      logger.error({ err: error }, "Holding added email failed")
    })
  }

  return serializeHolding(holding)
}

export async function updateHolding(params: {
  holdingId: string
  units?: number | undefined
  valueUsd?: number | undefined
  adminId: string
  ip?: string | undefined
}) {
  const existing = await prisma.holding.findUnique({
    where: { id: params.holdingId },
  })
  if (!existing) throw new NotFoundError("Holding")

  const holding = await prisma.holding.update({
    where: { id: params.holdingId },
    data: {
      ...(params.units !== undefined ? { units: toMoney(params.units) } : {}),
      ...(params.valueUsd !== undefined
        ? { valueUsd: round2(toMoney(params.valueUsd)) }
        : {}),
    },
  })

  await recordAudit({
    actorId: params.adminId,
    action: "holding.update",
    targetType: "Holding",
    targetId: holding.id,
    before: {
      units: existing.units.toString(),
      valueUsd: serialize(existing.valueUsd),
    },
    after: {
      units: holding.units.toString(),
      valueUsd: serialize(holding.valueUsd),
    },
    ip: params.ip,
  })

  return serializeHolding(holding)
}

/**
 * Finds the credit a holding put on the ledger, if it put one there.
 *
 * The link is the `holdingId` written into the transaction's metadata when the
 * position was booked — there is no foreign key, because a holding may or may
 * not have moved money and a nullable column would have implied it always
 * could.
 */
async function findHoldingCredit(holdingId: string, db: Db = prisma) {
  return db.transaction.findFirst({
    where: {
      type: TxType.CREDIT,
      category: TxCategory.HOLDING,
      status: TxStatus.COMPLETED,
      metadata: { path: ["holdingId"], equals: holdingId },
    },
  })
}

/**
 * Archives a position and, by default, takes back the money it added.
 *
 * Archiving used to remove the position from the dashboard and leave its
 * `CREDIT / HOLDING` row untouched, so the balance kept money that no position
 * explained. Now that booking a holding credits by default, that orphan would
 * have been the common case rather than the rare one.
 *
 * The reversal is a real `DEBIT / HOLDING`, not a deletion: the ledger is
 * append-only, and `sumCategory` nets the pair so invested capital comes back
 * down too. If the user has already spent the money the debit cannot settle —
 * that is surfaced rather than swallowed, and the admin can archive without
 * reversing if they mean to write it off.
 */
export async function archiveHolding(params: {
  holdingId: string
  adminId: string
  reverseLedger?: boolean | undefined
  /** Opt-in, like a manual debit — see `createAdjustment`. */
  notify?: boolean | undefined
  ip?: string | undefined
}) {
  const holding = await prisma.holding.findUnique({
    where: { id: params.holdingId },
  })
  if (!holding) throw new NotFoundError("Holding")
  // Guards against double-reversal: archiving twice would otherwise debit twice.
  if (holding.archivedAt) {
    throw new ValidationError("That holding is already archived.")
  }

  const reversing = params.reverseLedger !== false
  const original = reversing ? await findHoldingCredit(holding.id) : null

  let reversalId: string | null = null

  await prisma.$transaction(async (tx) => {
    if (original) {
      try {
        const reversal = await debit(
          {
            userId: holding.userId,
            amount: original.amount,
            category: TxCategory.HOLDING,
            description: `${holding.name} position removed — credit reversed`,
            metadata: { holdingId: holding.id, reversesTransactionId: original.id },
            processedById: params.adminId,
            status: TxStatus.COMPLETED,
          },
          tx
        )
        reversalId = reversal.id
      } catch (error) {
        if (error instanceof InsufficientFundsError) {
          throw new ValidationError(
            `Cannot reverse this position: the account no longer holds the ${serialize(original.amount)} it added. Archive without reversing to write it off instead.`
          )
        }
        throw error
      }
    }

    await tx.holding.update({
      where: { id: holding.id },
      data: { archivedAt: new Date() },
    })
  })

  await recordAudit({
    actorId: params.adminId,
    action: "holding.archive",
    targetType: "Holding",
    targetId: holding.id,
    after: {
      reversedLedger: Boolean(reversalId),
      reversalTransactionId: reversalId,
      amount: original ? serialize(original.amount) : null,
    },
    ip: params.ip,
  })

  // Only when money actually left, and only if asked. `original` carries the
  // amount because `reversalId` alone cannot say how much came back out.
  if (reversalId && original && params.notify === true) {
    const user = await prisma.user.findUnique({ where: { id: holding.userId } })
    const snapshot = await getBalanceSnapshot(holding.userId)

    if (user) {
      void sendAccountDebitedEmail(
        user,
        serialize(original.amount),
        `${holding.name} position removed`,
        serialize(snapshot.balance)
      ).catch((error: unknown) => {
        logger.error({ err: error }, "Holding reversal email failed")
      })
    }
  }

  return { reversed: Boolean(reversalId) }
}

export async function getAuditFilters() {
  const [actions, actors] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      orderBy: { username: "asc" },
      select: { id: true, username: true, email: true },
    }),
  ])

  return { actions: actions.map(({ action }) => action), actors }
}

async function auditSearch(
  search: string
): Promise<Prisma.AuditLogWhereInput[]> {
  const contains = {
    contains: search.replace(/[\\%_]/g, "\\$&"),
    mode: "insensitive",
  } as const
  const identity: Prisma.UserWhereInput = {
    OR: [{ email: search.toLowerCase() }, { uid: search.toUpperCase() }],
  }
  const users = await prisma.user.findMany({
    where: identity,
    select: {
      id: true,
      depositRequests: { select: { id: true } },
      withdrawalRequests: { select: { id: true } },
      holdings: { select: { id: true } },
      transactions: { select: { id: true } },
      subscriptions: { select: { id: true } },
      pins: { select: { id: true } },
    },
  })

  const matches: Prisma.AuditLogWhereInput[] = [
    { targetId: contains },
    { actor: { OR: [{ email: contains }, { uid: contains }] } },
  ]
  for (const user of users) {
    matches.push(
      { targetType: "User", targetId: user.id },
      { before: { path: ["userId"], equals: user.id } },
      { after: { path: ["userId"], equals: user.id } }
    )
    const targets = {
      DepositRequest: user.depositRequests,
      WithdrawalRequest: user.withdrawalRequests,
      Holding: user.holdings,
      Transaction: user.transactions,
      Subscription: user.subscriptions,
      WithdrawalPin: user.pins,
    }
    for (const [targetType, records] of Object.entries(targets)) {
      if (records.length) {
        matches.push({
          targetType,
          targetId: { in: records.map(({ id }) => id) },
        })
      }
    }
  }
  return matches
}

export async function listAuditLogs(
  query: Pagination & {
    cursor?: string | undefined
    action?: string | undefined
    actorId?: string | undefined
    from?: string | undefined
    to?: string | undefined
    search?: string | undefined
  }
) {
  const { action, actorId, cursor, from, to, search } = query
  const end = to && new Date(`${to}T00:00:00.000Z`)
  if (end) end.setUTCDate(end.getUTCDate() + 1)

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(actorId ? { actorId: actorId === "system" ? null : actorId } : {}),
    ...(from || end
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(end ? { lt: end } : {}),
          },
        }
      : {}),
    ...(search ? { OR: await auditSearch(search) } : {}),
  }
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { actor: { select: { username: true, email: true } } },
      ...(cursor
        ? { cursor: { id: cursor }, skip: 1, take: query.limit }
        : toSkipTake(query)),
    }),
    prisma.auditLog.count({ where }),
  ])

  const userIds = items.flatMap(({ targetType, targetId }) =>
    targetType === "User" && targetId ? [targetId] : []
  )
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, uid: true },
      })
    : []
  const uids = new Map(users.map(({ id, uid }) => [id, uid]))

  return {
    items: items.map((item) => ({
      ...item,
      targetUid:
        item.targetType === "User" && item.targetId
          ? (uids.get(item.targetId) ?? null)
          : null,
    })),
    total,
  }
}

const STATS_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The operator's view of the platform.
 *
 * Client liability is what the platform owes clients: their cash balances plus
 * the principal locked in active plans. Principal moving into a plan is a debit
 * on the ledger but is still owed, so it is added back.
 *
 * Flows are real money in and out, by kind, over the last 30 days. Internal
 * transfers (plan principal in and out) are left out, since they move nothing.
 */
export async function getStats(now = new Date()) {
  const since = new Date(now.getTime() - STATS_DAYS * DAY_MS)
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS)

  const settled = { status: TxStatus.COMPLETED }
  const sum = (where: Prisma.TransactionWhereInput) =>
    prisma.transaction.aggregate({ where, _sum: { amount: true }, _count: { _all: true } })

  const [
    userCount,
    activeUsers,
    newToday,
    newWeek,
    pendingDeposits,
    pendingWithdrawals,
    credited,
    debited,
    reserved,
    activePlans,
    maturing,
    depositsIn,
    withdrawalsOut,
    returnsPaid,
    series,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "USER" } }),
    prisma.user.count({ where: { role: "USER", status: UserStatus.ACTIVE } }),
    prisma.user.count({ where: { role: "USER", createdAt: { gte: dayStart } } }),
    prisma.user.count({ where: { role: "USER", createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    prisma.depositRequest.aggregate({
      where: { status: RequestStatus.PENDING },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: RequestStatus.PENDING },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    sum({ ...settled, type: TxType.CREDIT }),
    sum({ ...settled, type: TxType.DEBIT }),
    sum({ type: TxType.DEBIT, status: TxStatus.PENDING }),
    prisma.subscription.aggregate({
      where: { status: SubscriptionStatus.ACTIVE },
      _sum: { principal: true },
      _count: { _all: true },
    }),
    prisma.subscription.aggregate({
      where: { status: SubscriptionStatus.ACTIVE, endsAt: { lte: weekAhead } },
      _sum: { principal: true },
      _count: { _all: true },
    }),
    sum({ ...settled, category: TxCategory.DEPOSIT, createdAt: { gte: since } }),
    sum({ ...settled, category: TxCategory.WITHDRAWAL, createdAt: { gte: since } }),
    sum({
      ...settled,
      category: { in: [TxCategory.PLAN_PAYOUT, TxCategory.PROFIT] },
      createdAt: { gte: since },
    }),
    // Daily deposits and withdrawals for the chart, in UTC days.
    prisma.$queryRaw<Array<{ day: Date; deposits: Prisma.Decimal | null; withdrawals: Prisma.Decimal | null }>>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day,
             SUM(CASE WHEN category = 'DEPOSIT' THEN amount END) AS deposits,
             SUM(CASE WHEN category = 'WITHDRAWAL' THEN amount END) AS withdrawals
      FROM transactions
      WHERE status = 'COMPLETED'
        AND category IN ('DEPOSIT', 'WITHDRAWAL')
        AND "createdAt" >= ${since}
      GROUP BY 1
    `,
  ])

  const totalCredited = credited._sum.amount ?? ZERO
  const totalDebited = debited._sum.amount ?? ZERO
  const cash = round2(totalCredited.sub(totalDebited))
  const inPlans = activePlans._sum.principal ?? ZERO

  const byDay = new Map(
    series.map((row) => [row.day.toISOString().slice(0, 10), row])
  )
  const days = Array.from({ length: STATS_DAYS }, (_, index) => {
    const date = new Date(dayStart.getTime() - (STATS_DAYS - 1 - index) * DAY_MS)
    const key = date.toISOString().slice(0, 10)
    const row = byDay.get(key)
    return {
      date: key,
      deposits: serialize(row?.deposits ?? ZERO),
      withdrawals: serialize(row?.withdrawals ?? ZERO),
    }
  })

  return {
    users: { total: userCount, active: activeUsers, newToday, newThisWeek: newWeek },
    queues: {
      pendingDeposits: pendingDeposits._count._all,
      pendingDepositsAmount: serialize(pendingDeposits._sum.amount ?? ZERO),
      pendingWithdrawals: pendingWithdrawals._count._all,
      pendingWithdrawalsAmount: serialize(pendingWithdrawals._sum.amount ?? ZERO),
    },
    ledger: {
      totalCredited: serialize(totalCredited),
      totalDebited: serialize(totalDebited),
      /** Cash balances plus principal in active plans. */
      clientLiability: serialize(round2(cash.add(inPlans))),
      clientCash: serialize(cash),
      inPlans: serialize(inPlans),
      reserved: serialize(reserved._sum.amount ?? ZERO),
    },
    plans: {
      active: activePlans._count._all,
      maturingThisWeek: maturing._count._all,
      maturingPrincipal: serialize(maturing._sum.principal ?? ZERO),
    },
    flows: {
      days: STATS_DAYS,
      deposits: serialize(depositsIn._sum.amount ?? ZERO),
      depositCount: depositsIn._count._all,
      withdrawals: serialize(withdrawalsOut._sum.amount ?? ZERO),
      withdrawalCount: withdrawalsOut._count._all,
      returnsPaid: serialize(returnsPaid._sum.amount ?? ZERO),
      series: days,
    },
  }
}
