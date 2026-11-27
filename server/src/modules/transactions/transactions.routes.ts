import { TxCategory, TxStatus, TxType, type Prisma } from "@prisma/client"
import { Router } from "express"
import { z } from "zod"

import { buildPageMeta, ok, paginated } from "../../lib/http.js"
import { ZERO, serialize } from "../../lib/money.js"
import { paginationSchema, toSkipTake } from "../../lib/pagination.js"
import { prisma } from "../../lib/prisma.js"
import { asyncHandler } from "../../middleware/async-handler.js"
import { validate } from "../../middleware/validate.js"

export const transactionsRouter: Router = Router()

/**
 * Filters shared by the list and its summary, so the totals above a list are
 * always the totals of that list.
 *
 * `from` is inclusive and `to` exclusive, both ISO timestamps. The client sends
 * the bounds of the viewer's local days, so "today" means their today.
 */
const filterSchema = z.object({
  type: z.enum(TxType).optional(),
  status: z.enum(TxStatus).optional(),
  category: z.enum(TxCategory).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).max(100).optional(),
})

const listSchema = paginationSchema.extend(filterSchema.shape)

type Filters = z.infer<typeof filterSchema>

function whereFor(userId: string, query: Filters): Prisma.TransactionWhereInput {
  return {
    userId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lt: query.to } : {}),
          },
        }
      : {}),
    ...(query.q ? { description: { contains: query.q, mode: "insensitive" } } : {}),
  }
}

transactionsRouter.get(
  "/",
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listSchema>
    const where = whereFor(req.auth!.userId, query)

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        // `id` breaks ties, so a page boundary never splits or repeats rows
        // that share a timestamp (a catch-up writes several at once).
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...toSkipTake(query),
      }),
      prisma.transaction.count({ where }),
    ])

    paginated(
      res,
      items.map((tx) => ({
        id: tx.id,
        type: tx.type,
        category: tx.category,
        amount: serialize(tx.amount),
        status: tx.status,
        description: tx.description,
        metadata: tx.metadata,
        createdAt: tx.createdAt,
      })),
      buildPageMeta(query.page, query.limit, total)
    )
  })
)

/**
 * Totals for the same filters as the list: money in and out that has settled,
 * and what is still pending. Rejected and cancelled entries count toward
 * `count` only, since they never moved money.
 */
transactionsRouter.get(
  "/summary",
  validate({ query: filterSchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as Filters
    const where = whereFor(req.auth!.userId, query)

    const groups = await prisma.transaction.groupBy({
      by: ["type", "status"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    })

    const pick = (type: TxType, status: TxStatus) =>
      groups.find((group) => group.type === type && group.status === status)

    const pendingGroups = groups.filter((group) => group.status === TxStatus.PENDING)

    ok(res, {
      count: groups.reduce((sum, group) => sum + group._count._all, 0),
      moneyIn: serialize(pick(TxType.CREDIT, TxStatus.COMPLETED)?._sum.amount ?? ZERO),
      moneyOut: serialize(pick(TxType.DEBIT, TxStatus.COMPLETED)?._sum.amount ?? ZERO),
      pending: {
        count: pendingGroups.reduce((sum, group) => sum + group._count._all, 0),
        amount: serialize(
          pendingGroups.reduce((sum, group) => sum.add(group._sum.amount ?? ZERO), ZERO)
        ),
      },
    })
  })
)
