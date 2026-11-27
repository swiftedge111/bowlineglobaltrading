"use client"

import { CheckCircle2, Clock, XCircle } from "lucide-react"

import type { Subscription } from "@/lib/api/types"
import { formatDate, formatMoney, formatPercent } from "@/lib/format"
import { countdown } from "@/lib/use-now"
import { cn } from "@/lib/utils"

/**
 * One subscription: principal, earnings, term progress and the next payout.
 *
 * Shared by the dashboard and the plans page so the two never disagree about
 * how a running plan looks. `now` comes from the parent's `useNow`, so a page
 * of cards ticks on one timer.
 */
export function SubscriptionCard({
  subscription,
  now,
  onCancel,
}: {
  subscription: Subscription
  now: number
  /** Shown only for active plans. */
  onCancel?: () => void
}) {
  const { plan, status } = subscription
  const active = status === "ACTIVE"
  const progress =
    subscription.totalPeriods > 0
      ? (subscription.paidPeriods / subscription.totalPeriods) * 100
      : 0
  const next = subscription.nextPayoutAt
    ? countdown(subscription.nextPayoutAt, now)
    : null

  return (
    <li
      className={cn(
        "flex flex-col rounded-2xl border bg-white p-4 transition-colors",
        active ? "border-secondary-200 hover:border-primary-200" : "border-secondary-200/80 bg-secondary-50/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{plan.name}</p>
          <p className="text-xs text-secondary-500">
            Started {formatDate(subscription.startedAt)}
          </p>
        </div>
        {active ? (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 tabular-nums">
            {formatPercent(plan.dailyReturnPercent)} daily
          </span>
        ) : status === "COMPLETED" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
            <CheckCircle2 aria-hidden className="size-3.5" /> Completed
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary-100 px-2 py-0.5 text-xs font-semibold text-secondary-600 ring-1 ring-secondary-200">
            <XCircle aria-hidden className="size-3.5" /> Cancelled
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[11px] text-secondary-500">Principal</dt>
          <dd className="text-sm font-semibold tabular-nums">
            {formatMoney(subscription.principal)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-secondary-500">
            {active ? "Earned so far" : "Total earned"}
          </dt>
          <dd className="text-sm font-semibold text-emerald-600 tabular-nums">
            {formatMoney(subscription.totalAccrued, { showPlus: true })}
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-secondary-500 tabular-nums">
          <span>
            Day {subscription.paidPeriods} of {subscription.totalPeriods}
          </span>
          <span>
            {active ? "Ends" : status === "COMPLETED" ? "Matured" : "Term was to end"}{" "}
            {formatDate(subscription.endsAt)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${plan.name} term`}
          aria-valuemin={0}
          aria-valuemax={subscription.totalPeriods}
          aria-valuenow={subscription.paidPeriods}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary-100"
        >
          <div
            className={cn(
              "h-full rounded-full",
              active ? "bg-linear-to-r from-primary-500 to-primary-700" : "bg-secondary-300"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {(subscription.nextPayoutAt || (active && onCancel)) && (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-secondary-100 pt-3">
          {subscription.nextPayoutAt ? (
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-secondary-600">
              <Clock aria-hidden className="size-3.5 shrink-0 text-primary-600" />
              <span className="font-semibold text-secondary-900 tabular-nums">
                {formatMoney(subscription.dailyPayout, { showPlus: true })}
              </span>
              <span className="truncate">{next ? <>in {next}</> : <>being credited now</>}</span>
            </p>
          ) : (
            <span />
          )}
          {active && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-secondary-500 transition-colors outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-4 focus-visible:ring-red-100"
            >
              Cancel plan
            </button>
          )}
        </div>
      )}
    </li>
  )
}
