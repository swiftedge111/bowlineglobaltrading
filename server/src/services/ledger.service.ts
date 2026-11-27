import {
  Prisma,
  type TxCategory,
  TxStatus,
  TxType,
  type Transaction,
} from "@prisma/client"

import { InsufficientFundsError, NotFoundError } from "../lib/errors.js"
import { ZERO, round2, type Money } from "../lib/money.js"
import { prisma } from "../lib/prisma.js"

/**
 * Account balances come from the ledger.
 *
 * balance = Σ(COMPLETED CREDIT) − Σ(COMPLETED DEBIT)
 * available = balance − Σ(PENDING DEBIT)
 *
 * A pending debit reserves funds as soon as a withdrawal is requested.
 */

/** Prisma client or an interactive transaction — every function accepts either. */
export type Db = Prisma.TransactionClient | typeof prisma

export interface BalanceSnapshot {
  /** Settled funds. */
  balance: Money
  /** Settled minus funds reserved by pending withdrawals. */
  available: Money
  /** Total currently held against pending debits. */
  reserved: Money
}

interface Bucket {
  type: TxType
  status: TxStatus
  total: Money
}

async function loadBuckets(db: Db, userId: string): Promise<Bucket[]> {
  const rows = await db.transaction.groupBy({
    by: ["type", "status"],
    where: {
      userId,
      status: { in: [TxStatus.COMPLETED, TxStatus.PENDING] },
    },
    _sum: { amount: true },
  })

  return rows.map((row) => ({
    type: row.type,
    status: row.status,
    total: row._sum.amount ?? ZERO,
  }))
}

function pick(
  buckets: Bucket[],
  type: TxType,
  status: TxStatus
): Money {
  return (
    buckets.find((b) => b.type === type && b.status === status)?.total ?? ZERO
  )
}

export async function getBalanceSnapshot(
  userId: string,
  db: Db = prisma
): Promise<BalanceSnapshot> {
  const buckets = await loadBuckets(db, userId)

  const credited = pick(buckets, TxType.CREDIT, TxStatus.COMPLETED)
  const debited = pick(buckets, TxType.DEBIT, TxStatus.COMPLETED)
  const reserved = pick(buckets, TxType.DEBIT, TxStatus.PENDING)

  const balance = round2(credited.sub(debited))

  return {
    balance,
    reserved: round2(reserved),
    available: round2(balance.sub(reserved)),
  }
}

export async function getBalance(userId: string, db: Db = prisma): Promise<Money> {
  return (await getBalanceSnapshot(userId, db)).balance
}

export async function getAvailableBalance(
  userId: string,
  db: Db = prisma
): Promise<Money> {
  return (await getBalanceSnapshot(userId, db)).available
}

/**
 * Net completed movement in a category — credits minus debits.
 *
 * The netting is the whole point. `amount` is always stored positive and the
 * direction lives in `type`, so summing rows without splitting on type counts a
 * reversal as if it were more of the thing it reverses: debiting $50 of PROFIT
 * to claw back a mistaken credit used to push `profitEarned` *up* by $50 while
 * the balance correctly went down. Every figure built on this — profit earned,
 * today/week profit, invested capital, total return — drifted the wrong way,
 * silently.
 *
 * A category can legitimately net negative (more reversed than ever credited);
 * callers that divide by it must guard for that themselves.
 */
export async function sumCategory(
  userId: string,
  category: TxCategory | TxCategory[],
  options: { from?: Date; to?: Date; db?: Db } = {}
): Promise<Money> {
  const db = options.db ?? prisma
  const categories = Array.isArray(category) ? category : [category]

  const createdAt =
    options.from || options.to
      ? {
          ...(options.from ? { gte: options.from } : {}),
          ...(options.to ? { lte: options.to } : {}),
        }
      : undefined

  const rows = await db.transaction.groupBy({
    by: ["type"],
    where: {
      userId,
      category: { in: categories },
      status: TxStatus.COMPLETED,
      ...(createdAt ? { createdAt } : {}),
    },
    _sum: { amount: true },
  })

  const total = (type: TxType): Money =>
    rows.find((row) => row.type === type)?._sum.amount ?? ZERO

  return round2(total(TxType.CREDIT).sub(total(TxType.DEBIT)))
}

export interface EntryInput {
  userId: string
  amount: Money
  category: TxCategory
  description?: string
  metadata?: Prisma.InputJsonValue
  processedById?: string
  /** Defaults to COMPLETED for credits. */
  status?: TxStatus
  /**
   * When the money was earned, if that differs from when it is written.
   * Catch-up plan accrual records each missed day at its own time, so the
   * performance chart and the "today" and "this week" figures show it on the
   * right day. Defaults to now.
   */
  createdAt?: Date
}

/**
 * Records money in. Credits settle immediately unless a status is given
 * (deposit requests sit PENDING until an admin approves them).
 */
export async function credit(
  input: EntryInput,
  db: Db = prisma
): Promise<Transaction> {
  assertPositive(input.amount)

  return db.transaction.create({ data: creditRow(input) })
}

/**
 * Writes several credits in one statement. Used where a single event settles
 * many entries at once, so a long catch-up does not hold its transaction open
 * for one round trip per row.
 */
export async function creditMany(
  inputs: EntryInput[],
  db: Db = prisma
): Promise<number> {
  if (inputs.length === 0) return 0
  inputs.forEach((input) => assertPositive(input.amount))

  const { count } = await db.transaction.createMany({
    data: inputs.map(creditRow),
  })
  return count
}

function creditRow(input: EntryInput): Prisma.TransactionCreateManyInput {
  return {
    userId: input.userId,
    type: TxType.CREDIT,
    category: input.category,
    amount: round2(input.amount),
    status: input.status ?? TxStatus.COMPLETED,
    description: input.description ?? null,
    metadata: input.metadata ?? Prisma.JsonNull,
    processedById: input.processedById ?? null,
    processedAt: input.processedById ? new Date() : null,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  }
}

/**
 * Records money out, re-checking the available balance **inside** the
 * transaction that writes the row.
 *
 * This is what makes concurrent withdrawals safe: two requests that each pass
 * a check performed before the write would both succeed, so the check has to
 * happen under the same lock as the insert. `SELECT … FOR UPDATE` on the user
 * row serialises callers for the same account.
 */
export async function debit(
  input: EntryInput,
  db: Db = prisma
): Promise<Transaction> {
  assertPositive(input.amount)

  const run = async (tx: Prisma.TransactionClient): Promise<Transaction> => {
    // Serialises concurrent debits for this user. Without it, two requests can
    // interleave between the balance read and the insert.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE
    `
    if (locked.length === 0) {
      throw new NotFoundError("User")
    }

    const { available } = await getBalanceSnapshot(input.userId, tx)
    const amount = round2(input.amount)

    if (available.lessThan(amount)) {
      throw new InsufficientFundsError(
        `Insufficient available balance. Available ${available.toFixed(2)}, requested ${amount.toFixed(2)}.`
      )
    }

    return tx.transaction.create({
      data: {
        userId: input.userId,
        type: TxType.DEBIT,
        category: input.category,
        amount,
        status: input.status ?? TxStatus.PENDING,
        description: input.description ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        processedById: input.processedById ?? null,
        processedAt: input.processedById ? new Date() : null,
      },
    })
  }

  // Already inside an interactive transaction — reuse it rather than nesting.
  if (isTransactionClient(db)) {
    return run(db)
  }

  return prisma.$transaction(run, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  })
}

/**
 * Moves a PENDING entry to COMPLETED. For a debit this converts a reservation
 * into a real deduction — and because balance is derived, it stays deducted.
 */
export async function settle(
  transactionId: string,
  processedById: string,
  db: Db = prisma
): Promise<Transaction> {
  const updated = await db.transaction.updateMany({
    where: { id: transactionId, status: TxStatus.PENDING },
    data: {
      status: TxStatus.COMPLETED,
      processedById,
      processedAt: new Date(),
    },
  })

  if (updated.count === 0) {
    throw new NotFoundError("Pending transaction")
  }

  return db.transaction.findUniqueOrThrow({ where: { id: transactionId } })
}

/** Moves a PENDING entry to REJECTED or CANCELLED, releasing any reservation. */
export type UnwindStatus = Extract<TxStatus, "REJECTED" | "CANCELLED">

export async function unwind(
  transactionId: string,
  status: UnwindStatus,
  processedById: string | null,
  db: Db = prisma
): Promise<Transaction> {
  const updated = await db.transaction.updateMany({
    where: { id: transactionId, status: TxStatus.PENDING },
    data: {
      status,
      processedById,
      processedAt: new Date(),
    },
  })

  if (updated.count === 0) {
    throw new NotFoundError("Pending transaction")
  }

  return db.transaction.findUniqueOrThrow({ where: { id: transactionId } })
}

function assertPositive(amount: Money): void {
  if (!amount.greaterThan(0)) {
    throw new InsufficientFundsError("Amount must be greater than zero.")
  }
}

function isTransactionClient(db: Db): db is Prisma.TransactionClient {
  return !("$transaction" in db)
}
