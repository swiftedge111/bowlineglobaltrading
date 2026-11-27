"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  ArrowUpRight,
  ChartNoAxesCombined,
  Coins,
  Layers,
  Lock,
  PiggyBank,
  ReceiptText,
  TrendingUp,
} from "lucide-react"

import { AccountIdChip } from "@/components/app/account-id-chip"
import { AreaChart } from "@/components/app/area-chart"
import { ErrorState } from "@/components/app/empty-state"
import { Money } from "@/components/app/money"
import { StatusBadge } from "@/components/app/status-badge"
import { SubscriptionCard } from "@/components/plans/subscription-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/components/providers/auth-provider"
import * as api from "@/lib/api/endpoints"
import type {
  HoldingSummary,
  PerformancePeriod,
  PortfolioSummary,
  Subscription,
  Transaction,
  TxCategory,
} from "@/lib/api/types"
import {
  formatDate,
  formatMoney,
  formatPercent,
  formatUnits,
  isZero,
} from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

const PERIODS: Array<{ value: PerformancePeriod; label: string }> = [
  { value: "7d", label: "7D" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "1y", label: "1Y" },
  { value: "all", label: "All" },
]

const CATEGORY_LABEL: Record<TxCategory, string> = {
  DEPOSIT: "Deposit",
  PROFIT: "Trading profit",
  HOLDING: "Holding",
  WITHDRAWAL: "Withdrawal",
  ADJUSTMENT: "Adjustment",
  PLAN_PAYOUT: "Plan return",
  PLAN_PRINCIPAL: "Plan principal",
}

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

export function DashboardScreen() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<PerformancePeriod>("1m")

  const portfolio = useAsyncData(() => api.portfolio.summary(), "portfolio")
  const performance = useAsyncData(
    () => api.portfolio.performance(period),
    `performance:${period}`
  )
  const plans = useAsyncData(() => api.subscriptions.list(), "subscriptions")
  const recent = useAsyncData(
    () => api.transactions.list({ limit: 6 }),
    "recent-transactions"
  )

  const summary = portfolio.data
  const loadingSummary = portfolio.loading && !summary
  const firstName = user?.fullName?.trim().split(/\s+/)[0] ?? "there"
  const activePlans =
    plans.data?.subscriptions.filter((plan) => plan.status === "ACTIVE") ?? []

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Greeting */}
      <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] text-balance sm:text-4xl">
            Welcome back,{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              {firstName}.
            </span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            Here&apos;s where your account stands today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/deposit">
              <ArrowDownToLine aria-hidden />
              Deposit
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="border border-secondary-300 bg-white text-secondary-800 hover:border-primary-300 hover:bg-white hover:text-primary-700"
          >
            <Link href="/withdraw">
              <ArrowUpFromLine aria-hidden />
              Withdraw
            </Link>
          </Button>
          {/* Support asks for this on nearly every ticket. */}
          <AccountIdChip />
        </div>
      </div>

      {portfolio.error && !summary ? (
        <ErrorState
          title="Could not load your portfolio"
          description="Your balances are safe. This is a display problem."
          onRetry={portfolio.reload}
        />
      ) : (
        <div className="space-y-6">
          {summary && !isZero(summary.reserved) && (
            <ReservedNotice summary={summary} />
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <PortfolioCard
              summary={summary}
              loading={loadingSummary}
              period={period}
              onPeriod={setPeriod}
              points={performance.data?.points ?? []}
              chartLoading={performance.loading && !performance.data}
              chartError={Boolean(performance.error && !performance.data)}
              onRetryChart={performance.reload}
            />

            {/* Capital and profit side by side, in their own colours, so what
                you put in never blurs into what it has earned. */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
              <CapitalCard
                summary={summary}
                loading={loadingSummary}
                activeCount={plans.data ? activePlans.length : null}
              />
              <ProfitCard summary={summary} loading={loadingSummary} />
            </div>
          </div>

          <ActivePlans
            plans={activePlans}
            loading={plans.loading && !plans.data}
            error={Boolean(plans.error && !plans.data)}
            onRetry={plans.reload}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Holdings
              holdings={summary?.holdings ?? []}
              loading={loadingSummary}
            />
            <RecentActivity
              rows={recent.data?.items ?? []}
              loading={recent.loading && !recent.data}
              error={Boolean(recent.error && !recent.data)}
              onRetry={recent.reload}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- portfolio */

function PortfolioCard({
  summary,
  loading,
  period,
  onPeriod,
  points,
  chartLoading,
  chartError,
  onRetryChart,
}: {
  summary: PortfolioSummary | null
  loading: boolean
  period: PerformancePeriod
  onPeriod: (period: PerformancePeriod) => void
  points: Array<{ date: string; value: string }>
  chartLoading: boolean
  chartError: boolean
  onRetryChart: () => void
}) {
  const returnPercent = summary?.totalReturnPercent ?? "0"
  const negative = returnPercent.startsWith("-")
  // A brand-new account has a flat line at $0. A chart of nothing reads as
  // broken, so point at the action that starts the history instead.
  const noHistory =
    !chartLoading &&
    summary !== null &&
    isZero(summary.accountValue) &&
    points.every((point) => isZero(point.value))

  return (
    <section
      aria-labelledby="portfolio-title"
      className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-5 text-white shadow-xl shadow-primary-900/15 sm:p-7"
    >
      <div aria-hidden className="pointer-events-none absolute -top-28 -right-24 -z-10 size-80 rounded-full bg-sky-400/15 blur-3xl" />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-4">
        <h3
          id="portfolio-title"
          className="flex items-center gap-2 font-sans text-sm font-medium"
        >
          <ChartNoAxesCombined aria-hidden className="size-5 text-primary-300" />
          Portfolio overview
        </h3>
        <div role="group" aria-label="Chart period" className="flex rounded-lg bg-white/[0.06] p-0.5">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onPeriod(option.value)}
              aria-pressed={period === option.value}
              className={cn(
                "min-h-8 min-w-10 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white",
                period === option.value
                  ? "bg-white text-primary-900"
                  : "text-primary-100 hover:bg-white/10"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 text-xs font-medium text-primary-100">Account value · USD</p>
      {loading ? (
        <Skeleton className="mt-2 h-11 w-56 bg-white/10" />
      ) : (
        <p className="mt-1 font-heading text-4xl font-medium tracking-tight tabular-nums sm:text-5xl">
          {formatMoney(summary?.accountValue)}
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
            negative ? "bg-rose-400/15 text-rose-200" : "bg-emerald-400/15 text-emerald-200"
          )}
        >
          <TrendingUp aria-hidden className={cn("size-3.5", negative && "rotate-180")} />
          {formatPercent(returnPercent, { showPlus: true })}
        </span>
        <span className="text-primary-100">total return on deposits</span>
        {summary && !isZero(summary.todayProfit) && (
          <span className="text-emerald-200">
            {formatMoney(summary.todayProfit, { showPlus: true })} today
          </span>
        )}
      </p>

      <div className="mt-5">
        {chartError ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-primary-100">
            Could not load the chart.
            <button
              type="button"
              onClick={onRetryChart}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/25 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
            >
              Try again
            </button>
          </div>
        ) : noHistory ? (
          <div className="flex h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-6 text-center">
            <p className="font-semibold">Your chart starts with your first deposit</p>
            <p className="mt-1 max-w-sm text-sm text-primary-100">
              Once funds are credited, your account value and returns are tracked here day by day.
            </p>
            <Button asChild size="sm" variant="inverse" className="mt-4">
              <Link href="/deposit">
                Make a deposit <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        ) : (
          <AreaChart points={points} loading={chartLoading} tone="inverse" height={220} />
        )}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
        {[
          { label: "Available", value: summary?.available },
          { label: "In active plans", value: summary?.inPlans },
          { label: "Reserved", value: summary?.reserved },
        ].map((entry) => (
          <div key={entry.label} className="min-w-0">
            <dt className="truncate text-[11px] text-primary-100 sm:text-xs">{entry.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base">
              {loading ? (
                <Skeleton className="h-5 w-16 bg-white/10" />
              ) : (
                formatMoney(entry.value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** What the client has put in. Blue, to pair with the green profit card. */
function CapitalCard({
  summary,
  loading,
  activeCount,
}: {
  summary: PortfolioSummary | null
  loading: boolean
  activeCount: number | null
}) {
  return (
    <section
      aria-labelledby="capital-title"
      className={cn(card, "relative overflow-hidden p-5 sm:p-6")}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-primary-600" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="capital-title" className="font-sans text-sm font-semibold text-primary-700">
            Invested capital
          </h3>
          <p className="text-xs text-secondary-500">Everything you have deposited</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
          <PiggyBank aria-hidden className="size-4.5" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-40" />
      ) : (
        <p className="mt-3 font-heading text-3xl font-semibold tracking-tight tabular-nums">
          {formatMoney(summary?.investedCapital)}
        </p>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl bg-primary-50/60 px-3 py-2.5">
          <dt className="text-[11px] font-medium text-secondary-500">Working in plans</dt>
          <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">
            {loading ? <Skeleton className="h-4 w-14" /> : formatMoney(summary?.inPlans)}
          </dd>
        </div>
        <div className="min-w-0 rounded-xl bg-primary-50/60 px-3 py-2.5">
          <dt className="text-[11px] font-medium text-secondary-500">Active plans</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums">
            {activeCount === null ? <Skeleton className="h-4 w-6" /> : activeCount}
          </dd>
        </div>
      </dl>
    </section>
  )
}

/** What that capital has earned. */
function ProfitCard({
  summary,
  loading,
}: {
  summary: PortfolioSummary | null
  loading: boolean
}) {
  const returnPercent = summary?.totalReturnPercent ?? "0"

  return (
    <section
      aria-labelledby="profit-title"
      className={cn(card, "relative overflow-hidden p-5 sm:p-6")}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="profit-title" className="font-sans text-sm font-semibold text-emerald-700">
            Profit earned
          </h3>
          <p className="text-xs text-secondary-500">Plan returns and trading profit</p>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <TrendingUp aria-hidden className="size-4.5" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-36" />
      ) : (
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 font-heading text-3xl font-semibold tracking-tight tabular-nums">
          <Money value={summary?.profitEarned} signed className={isZero(summary?.profitEarned) ? "text-secondary-900" : undefined} />
          <span className="font-sans text-sm font-semibold text-emerald-700">
            {formatPercent(returnPercent, { showPlus: true })} on capital
          </span>
        </p>
      )}

      <dl className="mt-5 grid grid-cols-3 gap-2">
        {[
          { label: "Today", value: summary?.todayProfit },
          { label: "Yesterday", value: summary?.yesterdayProfit },
          { label: "7 days", value: summary?.weekProfit },
        ].map((entry) => (
          <div key={entry.label} className="min-w-0 rounded-xl bg-emerald-50/60 px-3 py-2.5">
            <dt className="text-[11px] font-medium text-secondary-500">{entry.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold">
              {loading ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                <Money value={entry.value} signed compact />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ReservedNotice({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-white text-amber-600 shadow-sm">
          <Lock aria-hidden className="size-4.5" />
        </span>
        <div>
          <p className="text-sm font-semibold">
            <Money value={summary.reserved} /> is reserved
          </p>
          <p className="mt-0.5 text-sm text-secondary-600">
            Held against a withdrawal awaiting review. It returns to your available balance if the
            request is rejected or cancelled.
          </p>
        </div>
      </div>
      <Link
        href="/withdraw"
        className={cn("shrink-0 rounded-md text-sm font-semibold text-amber-800 underline underline-offset-4", focusRing)}
      >
        View request
      </Link>
    </div>
  )
}

/* ------------------------------------------------------------ active plans */

function ActivePlans({
  plans,
  loading,
  error,
  onRetry,
}: {
  plans: Subscription[]
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  const now = useNow(30_000)

  return (
    <section aria-labelledby="plans-title" className={cn(card, "p-5 sm:p-6")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 id="plans-title" className="font-sans text-base font-semibold">
            Active plans
          </h3>
          <p className="mt-0.5 text-sm text-secondary-500">
            Returns are paid once every 24 hours from the moment you subscribe.
          </p>
        </div>
        <Link
          href="/plans"
          className={cn("inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-semibold text-primary-700 hover:text-primary-800", focusRing)}
        >
          {plans.length > 0 ? "Add a plan" : "Browse plans"}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Could not load your plans" onRetry={onRetry} className="py-8" />
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-primary-700 ring-1 ring-secondary-200">
              <Layers aria-hidden className="size-5" />
            </span>
            <div>
              <p className="font-semibold">No plan running yet</p>
              <p className="mt-0.5 text-sm text-secondary-600">
                Each plan pays a fixed daily return for its term, then returns your principal.
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/plans">
              Compare plans <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <SubscriptionCard key={plan.id} subscription={plan} now={now} />
          ))}
        </ul>
      )}
    </section>
  )
}

/* -------------------------------------------------------- holdings, activity */

function Holdings({
  holdings,
  loading,
}: {
  holdings: HoldingSummary[]
  loading: boolean
}) {
  return (
    <section aria-labelledby="holdings-title" className={cn(card, "p-5 sm:p-6")}>
      <h3 id="holdings-title" className="mb-4 font-sans text-base font-semibold">
        Holdings
      </h3>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : holdings.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-6 py-10 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-white text-secondary-400 ring-1 ring-secondary-200">
            <Coins aria-hidden className="size-5" />
          </span>
          <p className="mt-3 font-semibold">No holdings yet</p>
          <p className="mt-1 max-w-xs text-sm text-secondary-600">
            Assets added to your account will be listed here with their current value.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-secondary-100">
          {holdings.map((holding) => (
            <li key={holding.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-50 text-[11px] font-bold text-primary-700 ring-1 ring-primary-100">
                {holding.symbol.slice(0, 4).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{holding.name}</p>
                <p className="text-xs text-secondary-500 tabular-nums">
                  {formatUnits(holding.units)} {holding.symbol.toUpperCase()}
                </p>
              </div>
              <Money value={holding.valueUsd} className="shrink-0 text-sm font-semibold" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecentActivity({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: Transaction[]
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  return (
    <section aria-labelledby="activity-title" className={cn(card, "p-5 sm:p-6")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id="activity-title" className="font-sans text-base font-semibold">
          Recent activity
        </h3>
        <Link
          href="/transactions"
          className={cn("inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary-700 hover:text-primary-800", focusRing)}
        >
          View all <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Could not load your activity" onRetry={onRetry} className="py-8" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-6 py-10 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-white text-secondary-400 ring-1 ring-secondary-200">
            <ReceiptText aria-hidden className="size-5" />
          </span>
          <p className="mt-3 font-semibold">No activity yet</p>
          <p className="mt-1 max-w-xs text-sm text-secondary-600">
            Deposits, returns and withdrawals will show up here as they happen.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/deposit">Make a deposit</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-secondary-100">
          {rows.map((row) => {
            const credit = row.type === "CREDIT"
            const Icon = credit ? ArrowDownLeft : ArrowUpRight
            return (
              <li key={row.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-full",
                    credit ? "bg-emerald-50 text-emerald-600" : "bg-secondary-100 text-secondary-600"
                  )}
                >
                  <Icon aria-hidden className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {row.description ?? CATEGORY_LABEL[row.category]}
                  </p>
                  <p className="text-xs text-secondary-500">
                    {CATEGORY_LABEL[row.category]} · {formatDate(row.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Money
                    // Amounts are stored positive; the direction is in `type`.
                    value={credit ? row.amount : `-${row.amount}`}
                    signed
                    className="text-sm font-semibold"
                  />
                  {row.status !== "COMPLETED" && (
                    <StatusBadge status={row.status} className="px-2 py-0.5 text-[11px]" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
