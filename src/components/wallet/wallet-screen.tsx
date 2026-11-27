"use client"

import Link from "next/link"
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Clock,
  ReceiptText,
  Wallet,
} from "lucide-react"

import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/lib/api/endpoints"
import type { Transaction } from "@/lib/api/types"
import { formatDate, formatMoney, isZero } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/**
 * Money in and out of the account in one place: the Wallet tab of the mobile
 * bar. Deposit and Withdraw keep their own pages; this is the door to both,
 * with the balance and anything still in review alongside.
 */

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

export function WalletScreen() {
  const portfolio = useAsyncData(() => api.portfolio.summary(), "portfolio")
  const deposits = useAsyncData(
    () => api.transactions.list({ category: "DEPOSIT", limit: 5 }),
    "wallet-deposits"
  )
  const withdrawals = useAsyncData(
    () => api.transactions.list({ category: "WITHDRAWAL", limit: 5 }),
    "wallet-withdrawals"
  )
  const pendingDeposits = useAsyncData(() => api.deposits.list(), "deposit-history")

  const summary = portfolio.data
  const inReview = (pendingDeposits.data?.deposits ?? []).filter((item) => item.status === "PENDING")

  const activity = [...(deposits.data?.items ?? []), ...(withdrawals.data?.items ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6)
  const activityLoading = (deposits.loading && !deposits.data) || (withdrawals.loading && !withdrawals.data)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
          Your{" "}
          <span className="inline-block font-serif font-normal text-primary-600 italic">wallet.</span>
        </h2>
        <p className="mt-2 text-sm text-secondary-600 sm:text-base">
          Add money, take it out, and follow anything still being reviewed.
        </p>
      </div>

      {portfolio.error && !summary ? (
        <ErrorState title="Could not load your balance" onRetry={portfolio.reload} />
      ) : (
        <section
          aria-labelledby="wallet-balance"
          className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-6 text-white shadow-xl shadow-primary-900/15"
        >
          <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 -z-10 size-60 rounded-full bg-sky-400/20 blur-3xl" />
          <h3 id="wallet-balance" className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">
            <Wallet aria-hidden className="size-4" /> Available balance
          </h3>
          {!summary ? (
            <Skeleton className="mt-3 h-11 w-48 bg-white/10" />
          ) : (
            <p className="mt-2 font-heading text-4xl font-medium tracking-tight tabular-nums sm:text-5xl">
              {formatMoney(summary.available)}
            </p>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-sm">
            <div>
              <dt className="text-xs text-primary-100">Reserved for withdrawals</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{formatMoney(summary?.reserved)}</dd>
            </div>
            <div>
              <dt className="text-xs text-primary-100">In active plans</dt>
              <dd className="mt-0.5 font-semibold tabular-nums">{formatMoney(summary?.inPlans)}</dd>
            </div>
          </dl>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Link
              href="/deposit"
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-primary-900 shadow-lg transition-colors hover:bg-primary-50 focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
            >
              <ArrowDownToLine aria-hidden className="size-4.5" /> Deposit
            </Link>
            <Link
              href="/withdraw"
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/25 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
            >
              <ArrowUpFromLine aria-hidden className="size-4.5" /> Withdraw
            </Link>
          </div>
        </section>
      )}

      {/* In review */}
      {(inReview.length > 0 || (summary && !isZero(summary.reserved))) && (
        <section aria-labelledby="review-title" className="rounded-[1.5rem] border border-amber-200 bg-amber-50/60 p-5">
          <h3 id="review-title" className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <Clock aria-hidden className="size-4 text-amber-600" /> Being reviewed
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {inReview.map((deposit) => (
              <li key={deposit.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-amber-200">
                <span>
                  Deposit of <span className="font-semibold tabular-nums">{formatMoney(deposit.amount)}</span>
                  <span className="block text-xs text-secondary-500">Submitted {formatDate(deposit.createdAt)}</span>
                </span>
                <Link href="/deposit" className={cn("shrink-0 rounded-md text-xs font-semibold text-amber-900 underline underline-offset-4", focusRing)}>
                  View
                </Link>
              </li>
            ))}
            {summary && !isZero(summary.reserved) && (
              <li className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-amber-200">
                <span>
                  Withdrawals reserving <span className="font-semibold tabular-nums">{formatMoney(summary.reserved)}</span>
                  <span className="block text-xs text-secondary-500">You can cancel while they&apos;re pending</span>
                </span>
                <Link href="/withdraw" className={cn("shrink-0 rounded-md text-xs font-semibold text-amber-900 underline underline-offset-4", focusRing)}>
                  View
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Activity */}
      <section aria-labelledby="wallet-activity" className={cn(card, "p-5 sm:p-6")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id="wallet-activity" className="font-sans text-base font-semibold">
            Deposits and withdrawals
          </h3>
          <Link
            href="/transactions"
            className={cn("inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary-700", focusRing)}
          >
            All activity <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>

        {activityLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-6 py-10 text-center">
            <ReceiptText aria-hidden className="size-6 text-secondary-400" />
            <p className="mt-3 font-semibold">Nothing yet</p>
            <p className="mt-1 max-w-xs text-sm text-secondary-600">
              Your first deposit will show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-secondary-100">
            {activity.map((tx) => (
              <ActivityRow key={tx.id} tx={tx} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ActivityRow({ tx }: { tx: Transaction }) {
  const credit = tx.type === "CREDIT"
  const voided = tx.status === "REJECTED" || tx.status === "CANCELLED"
  const Icon = credit ? ArrowDownToLine : ArrowUpFromLine

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full ring-1",
          credit ? "bg-emerald-50 text-emerald-600 ring-emerald-100" : "bg-secondary-100 text-secondary-600 ring-secondary-200"
        )}
      >
        <Icon aria-hidden className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{tx.description ?? (credit ? "Deposit" : "Withdrawal")}</p>
        <p className="text-xs text-secondary-500">{formatDate(tx.createdAt)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            voided ? "text-secondary-400 line-through" : credit ? "text-emerald-600" : "text-secondary-900"
          )}
        >
          {credit ? "+" : "-"}
          {formatMoney(tx.amount)}
        </span>
        {tx.status !== "COMPLETED" && <StatusBadge status={tx.status} className="px-2 py-0.5 text-[11px]" />}
      </div>
    </li>
  )
}
