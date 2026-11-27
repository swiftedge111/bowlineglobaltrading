import {
  DepositMethod,
  RequestStatus,
  Role,
  SubscriptionStatus,
  TxCategory,
  TxStatus,
  TxType,
  UserStatus,
  WithdrawalMethod,
  type Prisma,
} from "@prisma/client"
import { Router } from "express"
import { z } from "zod"

import { env } from "../../config/env.js"
import {
  ADJUSTABLE_CATEGORIES,
  PIN_ALLOWED_LENGTHS,
  PIN_DEFAULT_TTL_MINUTES,
  PIN_MAX_TTL_MINUTES,
} from "../../config/constants.js"
import { buildPageMeta, clientIp, created, noContent, ok, paginated } from "../../lib/http.js"
import { ZERO, serialize } from "../../lib/money.js"
import { paginationSchema } from "../../lib/pagination.js"
import { prisma } from "../../lib/prisma.js"
import { asyncHandler } from "../../middleware/async-handler.js"
import { authenticate } from "../../middleware/authenticate.js"
import { requireAdmin } from "../../middleware/authorize.js"
import { validate } from "../../middleware/validate.js"
import { recordAudit } from "../../services/audit.service.js"
import {
  sendWithdrawalPinEmail,
  sendWithdrawalPinRevokedEmail,
} from "../../services/email/email.service.js"
import { getProofLink, processDeposit } from "../deposits/deposits.service.js"
import { issueReceipt } from "../receipts/receipts.service.js"
import { issuePin, listPins, revokePin } from "../pins/pins.service.js"
import * as plansService from "../plans/plans.service.js"
import { processWithdrawal } from "../withdrawals/withdrawals.service.js"
import { processWithdrawalSchema } from "../withdrawals/withdrawals.schema.js"
import * as service from "./admin.service.js"

export const adminRouter: Router = Router()

adminRouter.use(authenticate, requireAdmin)

const uidParam = z.object({ uid: z.string().trim().min(1) })
const idParam = z.object({ id: z.string().trim().min(1) })

/**
 * A boolean in a query string.
 *
 * NOT `z.coerce.boolean()`, which runs JavaScript truthiness: the string
 * `"false"` is non-empty and therefore coerces to `true`, so every opt-out
 * silently becomes an opt-in. Only the two literals are accepted.
 */
const booleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")

/* ------------------------------------------------------------------ stats */

adminRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    ok(res, await service.getStats())
  })
)

/* ------------------------------------------------------------------ users */

adminRouter.get(
  "/users",
  validate({
    query: paginationSchema.extend({
      search: z.string().trim().max(120).optional(),
      status: z.enum(UserStatus).optional(),
      role: z.enum(Role).optional(),
      sort: z.enum(service.USER_SORTS).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      page: number
      limit: number
      search?: string
      status?: UserStatus
      role?: Role
      sort?: service.UserSort
    }

    const { items, total } = await service.listUsers({
      pagination: { page: query.page, limit: query.limit },
      search: query.search,
      status: query.status,
      role: query.role,
      sort: query.sort,
    })

    paginated(res, items, buildPageMeta(query.page, query.limit, total))
  })
)

// Registered before `/users/:uid` so "summary" is not read as a UID.
adminRouter.get(
  "/users/summary",
  asyncHandler(async (_req, res) => {
    ok(res, await service.getUserCounts())
  })
)

adminRouter.get(
  "/users/:uid",
  validate({ params: uidParam }),
  asyncHandler(async (req, res) => {
    ok(res, await service.getUserDetail(req.params.uid as string))
  })
)

adminRouter.patch(
  "/users/:uid/status",
  validate({ params: uidParam, body: z.object({ status: z.enum(UserStatus) }) }),
  asyncHandler(async (req, res) => {
    await service.setUserStatus({
      uid: req.params.uid as string,
      status: req.body.status,
      adminId: req.auth!.userId,
      ip: clientIp(req),
    })
    ok(res, { message: "Account status updated." })
  })
)

/* ------------------------------------------------------------ adjustments */

adminRouter.post(
  "/users/:uid/adjustments",
  validate({
    params: uidParam,
    body: z.object({
      direction: z.enum(["credit", "debit"]),
      amount: z.coerce.number().positive(),
      // Restricted to the hand-writable set — see ADJUSTABLE_CATEGORIES. The
      // enum used to be open, so `credit` + `WITHDRAWAL` was accepted and
      // produced a row the withdrawal queue knew nothing about.
      category: z
        .enum(ADJUSTABLE_CATEGORIES)
        .default(TxCategory.ADJUSTMENT),
      description: z.string().trim().max(300).optional(),
      notify: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    created(
      res,
      await service.createAdjustment({
        uid: req.params.uid as string,
        adminId: req.auth!.userId,
        ip: clientIp(req),
        ...req.body,
      })
    )
  })
)

/* --------------------------------------------------------------- holdings */

adminRouter.post(
  "/users/:uid/holdings",
  validate({
    params: uidParam,
    body: z.object({
      name: z.string().trim().min(1).max(80),
      symbol: z.string().trim().min(1).max(20),
      units: z.coerce.number().nonnegative(),
      valueUsd: z.coerce.number().nonnegative(),
      /**
       * Whether to also credit the ledger. Explicit, not implied — but the
       * default is ON, because a position recorded here is nearly always money
       * the user has already sent by hand and expects the desk to book. Omit
       * the field and the balance moves; pass `false` only to record an asset
       * the account was never funded for.
       */
      creditLedger: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    created(res, {
      holding: await service.addHolding({
        uid: req.params.uid as string,
        adminId: req.auth!.userId,
        ip: clientIp(req),
        ...req.body,
      }),
    })
  })
)

adminRouter.patch(
  "/holdings/:id",
  validate({
    params: idParam,
    body: z.object({
      units: z.coerce.number().nonnegative().optional(),
      valueUsd: z.coerce.number().nonnegative().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    ok(res, {
      holding: await service.updateHolding({
        holdingId: req.params.id as string,
        adminId: req.auth!.userId,
        ip: clientIp(req),
        ...req.body,
      }),
    })
  })
)

adminRouter.delete(
  "/holdings/:id",
  validate({
    params: idParam,
    // Defaults to reversing, matching the default on the way in: if booking the
    // position added money, removing it should take that money back.
    query: z.object({
      reverseLedger: booleanQuery.optional(),
      // Off unless asked, matching a manual debit.
      notify: booleanQuery.optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const query = req.query as { reverseLedger?: boolean; notify?: boolean }

    const result = await service.archiveHolding({
      holdingId: req.params.id as string,
      adminId: req.auth!.userId,
      reverseLedger: query.reverseLedger,
      notify: query.notify,
      ip: clientIp(req),
    })
    ok(res, result)
  })
)

/* --------------------------------------------------------------- deposits */

/** What the proof file is, from its stored name, so the review can preview it. */
function proofKind(path: string | null): "image" | "pdf" | "file" | null {
  if (!path) return null
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(extension)) return "image"
  if (extension === "pdf") return "pdf"
  return "file"
}

const depositFilters = paginationSchema.extend({
  status: z.enum(RequestStatus).optional(),
  method: z.enum(DepositMethod).optional(),
  search: z.string().trim().max(120).optional(),
})

adminRouter.get(
  "/deposits",
  validate({ query: depositFilters }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof depositFilters>
    const search = query.search?.trim()
    const where: Prisma.DepositRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { user: { fullName: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              { user: { uid: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      prisma.depositRequest.findMany({
        where,
        // The queue is first come, first served; history reads newest first.
        orderBy:
          query.status === RequestStatus.PENDING
            ? [{ createdAt: "asc" }, { id: "asc" }]
            : [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          user: { select: { id: true, uid: true, email: true, fullName: true } },
          reviewedBy: { select: { fullName: true } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.depositRequest.count({ where }),
    ])

    // How many deposits each client on this page has had approved: a first
    // deposit is the one most worth a careful look.
    const userIds = [...new Set(items.map((item) => item.userId))]
    const approved = userIds.length
      ? await prisma.depositRequest.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, status: RequestStatus.APPROVED },
          _count: { _all: true },
        })
      : []
    const approvedBy = new Map(approved.map((row) => [row.userId, row._count._all]))

    paginated(
      res,
      items.map((deposit) => ({
        id: deposit.id,
        user: { uid: deposit.user.uid, email: deposit.user.email, fullName: deposit.user.fullName },
        amount: serialize(deposit.amount),
        method: deposit.method,
        reference: deposit.reference,
        status: deposit.status,
        hasProof: Boolean(deposit.proofPath),
        proofKind: proofKind(deposit.proofPath),
        userApprovedDeposits: approvedBy.get(deposit.userId) ?? 0,
        reviewedBy: deposit.reviewedBy?.fullName ?? null,
        reviewedAt: deposit.reviewedAt,
        reviewNote: deposit.reviewNote,
        createdAt: deposit.createdAt,
      })),
      buildPageMeta(query.page, query.limit, total)
    )
  })
)

adminRouter.get(
  "/deposits/summary",
  asyncHandler(async (_req, res) => {
    const now = new Date()
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [pending, oldest, today, month, rejected] = await Promise.all([
      prisma.depositRequest.aggregate({
        where: { status: RequestStatus.PENDING },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.depositRequest.findFirst({
        where: { status: RequestStatus.PENDING },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.depositRequest.aggregate({
        where: { status: RequestStatus.APPROVED, reviewedAt: { gte: startOfDay } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.depositRequest.aggregate({
        where: { status: RequestStatus.APPROVED, reviewedAt: { gte: monthAgo } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      prisma.depositRequest.count({
        where: { status: RequestStatus.REJECTED, reviewedAt: { gte: monthAgo } },
      }),
    ])

    ok(res, {
      pending: {
        count: pending._count._all,
        amount: serialize(pending._sum.amount ?? ZERO),
        oldestAt: oldest?.createdAt ?? null,
      },
      approvedToday: { count: today._count._all, amount: serialize(today._sum.amount ?? ZERO) },
      approved30d: { count: month._count._all, amount: serialize(month._sum.amount ?? ZERO) },
      rejected30d: rejected,
    })
  })
)

adminRouter.get(
  "/deposits/:id/proof",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const url = await getProofLink(req.params.id as string)
    ok(res, { url })
  })
)

adminRouter.post(
  "/deposits/:id/process",
  validate({
    params: idParam,
    body: z
      .object({
        action: z.enum(["approve", "reject"]),
        note: z.string().trim().max(500).optional(),
        receivedAmount: z.coerce
          .number()
          .positive()
          .max(100_000_000)
          // Whole cents. `multipleOf(0.01)` misjudges values like 0.07 in floats.
          .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
            message: "Use at most two decimal places.",
          })
          .optional(),
      })
      .refine((body) => body.action === "approve" || body.receivedAmount === undefined, {
        message: "Only an approval takes a received amount.",
        path: ["receivedAmount"],
      }),
  }),
  asyncHandler(async (req, res) => {
    await processDeposit({
      requestId: req.params.id as string,
      adminId: req.auth!.userId,
      action: req.body.action,
      note: req.body.note,
      receivedAmount: req.body.receivedAmount,
      ip: clientIp(req),
    })
    ok(res, { message: `Deposit ${req.body.action}d.` })
  })
)

/* ------------------------------------------------------------ withdrawals */

const withdrawalFilters = paginationSchema.extend({
  status: z.enum(RequestStatus).optional(),
  method: z.enum(WithdrawalMethod).optional(),
  search: z.string().trim().max(120).optional(),
})

/** Where a payout goes, normalised so the same wallet or account always matches. */
function destinationKey(destination: Prisma.JsonValue): string | null {
  if (!destination || typeof destination !== "object" || Array.isArray(destination)) return null
  const value = destination as Record<string, unknown>
  if (typeof value.walletAddress === "string") return `w:${value.walletAddress.trim().toLowerCase()}`
  if (typeof value.accountNumber === "string") return `a:${value.accountNumber.replace(/[\s-]/g, "")}`
  return null
}

adminRouter.get(
  "/withdrawals",
  validate({ query: withdrawalFilters }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof withdrawalFilters>
    const search = query.search?.trim()
    const where: Prisma.WithdrawalRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(search
        ? {
            OR: [
              { user: { fullName: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              { user: { uid: { contains: search, mode: "insensitive" } } },
              { destination: { path: ["walletAddress"], string_contains: search } },
              { destination: { path: ["accountNumber"], string_contains: search } },
            ],
          }
        : {}),
    }

    const [items, total] = await Promise.all([
      prisma.withdrawalRequest.findMany({
        where,
        // The queue is first come, first served; history reads newest first.
        orderBy:
          query.status === RequestStatus.PENDING
            ? [{ createdAt: "asc" }, { id: "asc" }]
            : [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          user: { select: { uid: true, email: true, fullName: true } },
          reviewedBy: { select: { fullName: true } },
          transaction: { select: { metadata: true } },
        },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.withdrawalRequest.count({ where }),
    ])

    // Signals for the reviewer, per client on this page: payouts already made
    // and where to, and how much they have actually paid in.
    const userIds = [...new Set(items.map((item) => item.userId))]
    const [paidBefore, deposits] = userIds.length
      ? await Promise.all([
          prisma.withdrawalRequest.findMany({
            where: { userId: { in: userIds }, status: RequestStatus.APPROVED },
            select: { id: true, userId: true, destination: true },
          }),
          prisma.transaction.groupBy({
            by: ["userId", "type"],
            where: {
              userId: { in: userIds },
              category: TxCategory.DEPOSIT,
              status: TxStatus.COMPLETED,
            },
            _sum: { amount: true },
          }),
        ])
      : [[], []]

    const depositedBy = new Map<string, Prisma.Decimal>()
    for (const row of deposits) {
      const sum = row._sum.amount ?? ZERO
      const current = depositedBy.get(row.userId) ?? ZERO
      depositedBy.set(row.userId, row.type === TxType.CREDIT ? current.add(sum) : current.sub(sum))
    }

    paginated(
      res,
      items.map((request) => {
        const key = destinationKey(request.destination)
        const others = paidBefore.filter((paid) => paid.userId === request.userId && paid.id !== request.id)
        const deposited = depositedBy.get(request.userId) ?? ZERO
        const metadata = request.transaction.metadata as Record<string, unknown> | null
        return {
          id: request.id,
          user: request.user,
          amount: serialize(request.amount),
          fee: serialize(request.feeAmount),
          total: serialize(request.amount.add(request.feeAmount)),
          method: request.method,
          destination: request.destination,
          status: request.status,
          reviewedBy: request.reviewedBy?.fullName ?? null,
          reviewedAt: request.reviewedAt,
          reviewNote: request.reviewNote,
          payoutReference: typeof metadata?.payoutReference === "string" ? metadata.payoutReference : null,
          signals: {
            /** Approved withdrawals before this one. */
            previousPayouts: others.length,
            /** Never paid to this wallet or account before. */
            newDestination: key !== null && !others.some((paid) => destinationKey(paid.destination) === key),
            /** Net deposits over the account's life. */
            deposited: serialize(deposited),
            exceedsDeposits: request.amount.gt(deposited),
          },
          createdAt: request.createdAt,
        }
      }),
      buildPageMeta(query.page, query.limit, total)
    )
  })
)

adminRouter.get(
  "/withdrawals/summary",
  asyncHandler(async (_req, res) => {
    const now = new Date()
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const paid = (since: Date) =>
      prisma.withdrawalRequest.aggregate({
        where: { status: RequestStatus.APPROVED, reviewedAt: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true, feeAmount: true },
      })

    const [pending, oldest, today, month, rejected] = await Promise.all([
      prisma.withdrawalRequest.aggregate({
        where: { status: RequestStatus.PENDING },
        _count: { _all: true },
        _sum: { amount: true, feeAmount: true },
      }),
      prisma.withdrawalRequest.findFirst({
        where: { status: RequestStatus.PENDING },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      paid(startOfDay),
      paid(monthAgo),
      prisma.withdrawalRequest.count({
        where: { status: RequestStatus.REJECTED, reviewedAt: { gte: monthAgo } },
      }),
    ])

    ok(res, {
      pending: {
        count: pending._count._all,
        /** What has to be sent out: client payouts, fees excluded. */
        amount: serialize(pending._sum.amount ?? ZERO),
        fees: serialize(pending._sum.feeAmount ?? ZERO),
        oldestAt: oldest?.createdAt ?? null,
      },
      paidToday: { count: today._count._all, amount: serialize(today._sum.amount ?? ZERO) },
      paid30d: {
        count: month._count._all,
        amount: serialize(month._sum.amount ?? ZERO),
        fees: serialize(month._sum.feeAmount ?? ZERO),
      },
      rejected30d: rejected,
    })
  })
)

adminRouter.post(
  "/withdrawals/:id/process",
  validate({ params: idParam, body: processWithdrawalSchema }),
  asyncHandler(async (req, res) => {
    await processWithdrawal({
      requestId: req.params.id as string,
      adminId: req.auth!.userId,
      action: req.body.action,
      note: req.body.note,
      payoutReference: req.body.payoutReference,
      ip: clientIp(req),
    })
    ok(res, { message: `Withdrawal ${req.body.action}d.` })
  })
)

/* -------------------------------------------------------------------- pins */

adminRouter.post(
  "/users/:uid/pins",
  validate({
    params: uidParam,
    body: z.object({
      length: z
        .union([z.literal(4), z.literal(6)])
        .default(PIN_ALLOWED_LENGTHS[0]),
      ttlMinutes: z.coerce
        .number()
        .int()
        .min(1)
        .max(PIN_MAX_TTL_MINUTES)
        .default(PIN_DEFAULT_TTL_MINUTES),
      notifyUser: z.boolean().default(true),
      shareLink: z.boolean().default(false),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { uid: req.params.uid as string },
    })
    if (!user) {
      ok(res, { message: "User not found." }, 404)
      return
    }

    const issued = await issuePin({
      userId: user.id,
      issuedById: req.auth!.userId,
      length: req.body.length,
      ttlMinutes: req.body.ttlMinutes,
      shareLink: req.body.shareLink,
    })

    await recordAudit({
      actorId: req.auth!.userId,
      action: "pin.issue",
      targetType: "WithdrawalPin",
      targetId: issued.id,
      // Deliberately never the PIN itself.
      after: { userId: user.id, expiresAt: issued.expiresAt.toISOString() },
      ip: clientIp(req),
    })

    // The email now carries the PIN itself, so this is the user's copy rather
    // than a heads-up that one exists. Still non-fatal: a bounced email must
    // not fail the request, because the admin holds the PIN either way and
    // relaying it by hand is the fallback.
    if (req.body.notifyUser) {
      void sendWithdrawalPinEmail(user, issued.pin, req.body.ttlMinutes).catch(
        () => {}
      )
    }

    // The raw PIN is returned exactly once, to the issuing admin.
    created(res, {
      pin: issued.pin,
      expiresAt: issued.expiresAt,
      user: { uid: user.uid, fullName: user.fullName },
      ...(issued.shareToken
        ? {
            shareUrl: `${env.APP_URL.replace(/\/$/, "")}/pin/${issued.shareToken}`,
          }
        : {}),
    })
  })
)

adminRouter.get(
  "/pins",
  validate({ query: z.object({ uid: z.string().trim().optional() }) }),
  asyncHandler(async (req, res) => {
    const { uid } = req.query as { uid?: string }

    let userId: string | undefined
    if (uid) {
      const user = await prisma.user.findUnique({ where: { uid } })
      // An unknown UID must return an empty result.
      if (!user) {
        ok(res, { pins: [] })
        return
      }
      userId = user.id
    }

    const pins = await listPins(userId)
    ok(res, {
      pins: pins.map((pin) => ({
        id: pin.id,
        user: pin.user,
        status: pin.status,
        expiresAt: pin.expiresAt,
        usedAt: pin.usedAt,
        createdAt: pin.createdAt,
      })),
    })
  })
)

adminRouter.delete(
  "/pins/:id",
  validate({
    params: idParam,
    // Off by default, mirroring issue: a PIN the user was never told about
    // should not be announced to them at the moment it is cancelled.
    query: z.object({ notifyUser: booleanQuery.optional() }),
  }),
  asyncHandler(async (req, res) => {
    const owner = await revokePin(req.params.id as string)

    if (owner && (req.query as { notifyUser?: boolean }).notifyUser) {
      void sendWithdrawalPinRevokedEmail(owner).catch(() => {
        /* non-fatal — the PIN is already dead in the database */
      })
    }

    await recordAudit({
      actorId: req.auth!.userId,
      action: "pin.revoke",
      targetType: "WithdrawalPin",
      targetId: req.params.id as string,
      ip: clientIp(req),
    })
    noContent(res)
  })
)

/* -------------------------------------------------------- payment methods */

adminRouter.get(
  "/payment-methods",
  asyncHandler(async (_req, res) => {
    const [bank, crypto, wallets] = await Promise.all([
      prisma.bankAccountConfig.findFirst(),
      prisma.cryptoWalletConfig.findMany({ orderBy: { currency: "asc" } }),
      prisma.digitalWalletConfig.findMany({ orderBy: { provider: "asc" } }),
    ])
    ok(res, { bank, crypto, digitalWallets: wallets })
  })
)

adminRouter.put(
  "/payment-methods/bank",
  validate({
    body: z.object({
      bankName: z.string().trim().min(2).max(120),
      accountName: z.string().trim().min(2).max(120),
      accountNumber: z.string().trim().min(4).max(40),
      routingNumber: z.string().trim().max(40).optional(),
      swiftCode: z.string().trim().max(20).optional(),
      isActive: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.bankAccountConfig.findFirst()
    const bank = existing
      ? await prisma.bankAccountConfig.update({
          where: { id: existing.id },
          data: req.body,
        })
      : await prisma.bankAccountConfig.create({ data: req.body })

    await recordAudit({
      actorId: req.auth!.userId,
      action: "payment-method.bank.update",
      targetType: "BankAccountConfig",
      targetId: bank.id,
      ip: clientIp(req),
    })

    ok(res, { bank })
  })
)

adminRouter.put(
  "/payment-methods/crypto",
  validate({
    body: z.object({
      currency: z.string().trim().min(2).max(20).toUpperCase(),
      label: z.string().trim().min(2).max(60),
      walletAddress: z.string().trim().min(10).max(120),
      network: z.string().trim().min(2).max(40),
      isActive: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const wallet = await prisma.cryptoWalletConfig.upsert({
      where: { currency: req.body.currency },
      create: req.body,
      update: req.body,
    })

    await recordAudit({
      actorId: req.auth!.userId,
      action: "payment-method.crypto.upsert",
      targetType: "CryptoWalletConfig",
      targetId: wallet.id,
      after: { currency: wallet.currency, network: wallet.network },
      ip: clientIp(req),
    })

    ok(res, { wallet })
  })
)

adminRouter.delete(
  "/payment-methods/crypto/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.cryptoWalletConfig.delete({
      where: { id: req.params.id as string },
    })
    await recordAudit({
      actorId: req.auth!.userId,
      action: "payment-method.crypto.delete",
      targetType: "CryptoWalletConfig",
      targetId: req.params.id as string,
      ip: clientIp(req),
    })
    noContent(res)
  })
)

adminRouter.put(
  "/payment-methods/wallets",
  validate({
    body: z.object({
      provider: z.string().trim().min(2).max(40),
      handle: z.string().trim().min(2).max(120),
      instructions: z.string().trim().max(300).optional(),
      isActive: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const wallet = await prisma.digitalWalletConfig.upsert({
      where: { provider: req.body.provider },
      create: req.body,
      update: req.body,
    })

    await recordAudit({
      actorId: req.auth!.userId,
      action: "payment-method.wallet.upsert",
      targetType: "DigitalWalletConfig",
      targetId: wallet.id,
      ip: clientIp(req),
    })

    ok(res, { wallet })
  })
)

adminRouter.delete(
  "/payment-methods/wallets/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.digitalWalletConfig.delete({
      where: { id: req.params.id as string },
    })
    await recordAudit({
      actorId: req.auth!.userId,
      action: "payment-method.wallet.delete",
      targetType: "DigitalWalletConfig",
      targetId: req.params.id as string,
      ip: clientIp(req),
    })
    noContent(res)
  })
)

/* ------------------------------------------------------------------ plans */

/**
 * Rates are basis points, not percent — 250 is 2.50%/day. Integer maths is
 * what keeps the accrual job free of float drift, so the API speaks the same
 * units the column stores rather than converting at the edge.
 */
const planBody = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and single hyphens."
    ),
  name: z.string().trim().min(2).max(60),
  dailyReturnBps: z.coerce.number().int().min(1).max(10_000),
  durationDays: z.coerce.number().int().min(1).max(3_650),
  minDeposit: z.coerce.number().nonnegative(),
  maxDeposit: z.coerce.number().positive().nullable().optional(),
  referralBonusPercent: z.coerce.number().int().min(0).max(100).default(0),
  description: z.string().trim().min(1).max(500),
  features: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  isPopular: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
})

adminRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    ok(res, { plans: await plansService.adminListPlans() })
  })
)

adminRouter.post(
  "/plans",
  validate({ body: planBody }),
  asyncHandler(async (req, res) => {
    created(res, {
      plan: await plansService.createPlan({
        input: req.body,
        adminId: req.auth!.userId,
        ip: clientIp(req),
      }),
    })
  })
)

adminRouter.patch(
  "/plans/:id",
  validate({ params: idParam, body: planBody.partial() }),
  asyncHandler(async (req, res) => {
    ok(res, {
      plan: await plansService.updatePlan({
        planId: req.params.id as string,
        input: req.body,
        adminId: req.auth!.userId,
        ip: clientIp(req),
      }),
    })
  })
)

adminRouter.delete(
  "/plans/:id",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    ok(
      res,
      await plansService.retirePlan({
        planId: req.params.id as string,
        adminId: req.auth!.userId,
        ip: clientIp(req),
      })
    )
  })
)

/* ---------------------------------------------------------- subscriptions */

adminRouter.get(
  "/subscriptions",
  validate({
    query: paginationSchema.extend({
      status: z.enum(SubscriptionStatus).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      page: number
      limit: number
      status?: SubscriptionStatus
    }

    const { items, total } = await plansService.adminListSubscriptions({
      pagination: { page: query.page, limit: query.limit },
      status: query.status,
    })

    paginated(res, items, buildPageMeta(query.page, query.limit, total))
  })
)

adminRouter.post(
  "/subscriptions/:id/cancel",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await plansService.adminCancelSubscription({
      subscriptionId: req.params.id as string,
      adminId: req.auth!.userId,
      ip: clientIp(req),
    })
    ok(res, { message: "Subscription cancelled and principal returned." })
  })
)

/* ------------------------------------------------------------- audit logs */

adminRouter.get(
  "/audit-logs",
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { page: number; limit: number }
    const { items, total } = await service.listAuditLogs(query)
    paginated(res, items, buildPageMeta(query.page, query.limit, total))
  })
)

/* -------------------------------------------------------------- deposits (config echo) */

adminRouter.get(
  "/deposit-methods",
  asyncHandler(async (_req, res) => {
    ok(res, { methods: Object.values(DepositMethod) })
  })
)

/* -------------------------------------------------------------- receipts */

/**
 * Mints the shareable receipt for a transaction, or hands back the one that
 * already exists. Idempotent on purpose — clicking twice must not produce a
 * second reference for the same payment.
 */
adminRouter.post(
  "/transactions/:id/receipt",
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const receipt = await issueReceipt({
      transactionId: req.params.id as string,
      adminId: req.auth!.userId,
      ip: clientIp(req),
    })
    ok(res, { receipt })
  })
)
