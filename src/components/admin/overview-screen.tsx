"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CalendarClock,
  Landmark,
  RefreshCw,
  ScrollText,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"

import { ErrorState } from "@/components/app/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/lib/api/endpoints"
import type { AdminStats } from "@/lib/api/types"
import { formatDate, formatMoney, formatRelative, humanise, initials } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/** What needs doing, what is owed, and how money is moving. */

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

const cents = (value: string | null | undefined) => Math.round(Number(value ?? "0") * 100) || 0

export function AdminOverviewScreen() {
  const [refreshKey, setRefreshKey] = useState(0)
  const stats = useAsyncData(() => api.admin.stats(), `admin-stats:${refreshKey}`)
  const signups = useAsyncData(() => api.admin.users({ limit: 5, role: "USER" }), `admin-signups:${refreshKey}`)
  const audit = useAsyncData(() => api.admin.auditLogs({ limit: 6 }), `admin-audit:${refreshKey}`)

  const data = stats.data
  const loading = stats.loading && !data

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Platform{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">overview.</span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            What needs your attention, what clients are owed, and how money is moving.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          className={cn(
            "inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-secondary-200 bg-white px-4 text-sm font-semibold text-secondary-700 shadow-sm hover:border-primary-300 hover:text-primary-700",
            focusRing
          )}
        >
          <RefreshCw aria-hidden className={cn("size-4", stats.loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {stats.error && !data ? (
        <ErrorState title="Could not load platform stats" onRetry={stats.reload} />
      ) : (
        <>
          {/* Needs attention */}
          <section aria-labelledby="attention-title">
            <h3 id="attention-title" className="mb-3 text-xs font-semibold tracking-[0.14em] text-secondary-500 uppercase">
              Needs attention
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <QueueCard
                href="/admin/deposits"
                icon={ArrowDownToLine}
                label="Deposits to review"
                count={data?.queues.pendingDeposits}
                amount={data?.queues.pendingDepositsAmount}
                loading={loading}
                urgent
              />
              <QueueCard
                href="/admin/withdrawals"
                icon={ArrowUpFromLine}
                label="Withdrawals to review"
                count={data?.queues.pendingWithdrawals}
                amount={data?.queues.pendingWithdrawalsAmount}
                loading={loading}
                urgent
              />
              <QueueCard
                href="/admin/subscriptions"
                icon={CalendarClock}
                label="Plans maturing in 7 days"
                count={data?.plans.maturingThisWeek}
                amount={data?.plans.maturingPrincipal}
                amountLabel="principal due back"
                loading={loading}
              />
              <QueueCard
                href="/admin/users"
                icon={UserPlus}
                label="New clients today"
                count={data?.users.newToday}
                note={data ? `${data.users.newThisWeek} this week` : undefined}
                loading={loading}
              />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <LiabilityCard data={data} loading={loading} />
            <FlowsCard data={data} loading={loading} />
          </div>
        </>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent signups */}
        <section aria-labelledby="signups-title" className={cn(card, "min-w-0 p-5 sm:p-6")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 id="signups-title" className="flex items-center gap-2 font-sans text-base font-semibold">
              <Users aria-hidden className="size-4.5 text-primary-600" /> Newest clients
            </h3>
            <Link href="/admin/users" className={cn("inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary-700", focusRing)}>
              All clients <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          {signups.loading && !signups.data ? (
            <ListSkeleton />
          ) : (signups.data?.items.length ?? 0) === 0 ? (
            <p className="rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-5 py-8 text-center text-sm text-secondary-600">
              No clients have signed up yet.
            </p>
          ) : (
            <ul className="divide-y divide-secondary-100">
              {signups.data?.items.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`/admin/users/${user.uid}`}
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 outline-none hover:bg-secondary-50 focus-visible:ring-4 focus-visible:ring-primary-200"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 ring-1 ring-primary-100">
                      {initials(user.fullName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{user.fullName}</span>
                      <span className="block truncate text-xs text-secondary-500">
                        {user.email}
                        {user.country ? ` · ${user.country}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">{formatMoney(user.balance)}</span>
                      <span className="hidden text-[11px] text-secondary-500 sm:block">Joined {formatDate(user.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent admin activity */}
        <section aria-labelledby="audit-title" className={cn(card, "min-w-0 p-5 sm:p-6")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 id="audit-title" className="flex items-center gap-2 font-sans text-base font-semibold">
              <ScrollText aria-hidden className="size-4.5 text-primary-600" /> Recent admin actions
            </h3>
            <Link href="/admin/audit-logs" className={cn("inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary-700", focusRing)}>
              Audit log <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
          {audit.loading && !audit.data ? (
            <ListSkeleton />
          ) : (audit.data?.items.length ?? 0) === 0 ? (
            <p className="rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-5 py-8 text-center text-sm text-secondary-600">
              No admin actions recorded yet.
            </p>
          ) : (
            <ol className="relative space-y-4 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-secondary-200">
              {audit.data?.items.map((entry) => (
                <li key={entry.id} className="relative">
                  <span aria-hidden className="absolute top-1.5 -left-5 size-[11px] rounded-full border-2 border-white bg-primary-600 ring-1 ring-primary-200" />
                  <p className="text-sm font-semibold">{humanise(entry.action)}</p>
                  <p className="text-xs text-secondary-500">
                    {entry.actor ? `@${entry.actor.username}` : "System"}
                    {entry.targetType ? ` · ${humanise(entry.targetType)}` : ""} · {formatRelative(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- cards */

function QueueCard({
  href,
  icon: Icon,
  label,
  count,
  amount,
  amountLabel = "in total",
  note,
  loading,
  urgent = false,
}: {
  href: string
  icon: LucideIcon
  label: string
  count: number | undefined
  amount?: string
  amountLabel?: string
  note?: string
  loading: boolean
  /** Amber when there is anything waiting. */
  urgent?: boolean
}) {
  const waiting = urgent && (count ?? 0) > 0

  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col rounded-[1.25rem] border p-4 shadow-sm sm:rounded-[1.5rem] sm:p-5 transition-all hover:-translate-y-0.5 hover:shadow-md",
        focusRing,
        waiting ? "border-amber-300 bg-amber-50/70" : "border-secondary-200 bg-white hover:border-primary-200"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl ring-1",
            waiting ? "bg-white text-amber-600 ring-amber-200" : "bg-primary-50 text-primary-700 ring-primary-100"
          )}
        >
          <Icon aria-hidden className="size-5" />
        </span>
        {waiting && (
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-70" />
            <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
          </span>
        )}
      </div>
      <p className="mt-3 text-xs leading-snug text-secondary-600 sm:mt-4 sm:text-sm">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-9 w-16" />
      ) : (
        <p className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{count ?? 0}</p>
      )}
      <p className="mt-1 flex items-center justify-between gap-2 text-xs text-secondary-500">
        <span className="truncate tabular-nums">
          {amount !== undefined ? `${formatMoney(amount)} ${amountLabel}` : (note ?? " ")}
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-primary-600 transition-transform group-hover:translate-x-0.5" />
      </p>
    </Link>
  )
}

function LiabilityCard({ data, loading }: { data: AdminStats | undefined | null; loading: boolean }) {
  const cash = cents(data?.ledger.clientCash)
  const plans = cents(data?.ledger.inPlans)
  const total = Math.max(cash + plans, 0)
  const cashShare = total > 0 ? (Math.max(cash, 0) / total) * 100 : 0

  return (
    <section
      aria-labelledby="liability-title"
      className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-6 text-white shadow-xl shadow-primary-900/15 sm:p-7"
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-sky-400/20 blur-3xl" />
      <h3 id="liability-title" className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">
        <Landmark aria-hidden className="size-4" /> Owed to clients
      </h3>
      {loading ? (
        <Skeleton className="mt-3 h-11 w-52 bg-white/10" />
      ) : (
        <p className="mt-2 font-heading text-4xl font-medium tracking-tight tabular-nums sm:text-5xl">
          {formatMoney(data?.ledger.clientLiability)}
        </p>
      )}
      <p className="mt-1 text-sm text-primary-100">Cash balances plus principal in active plans.</p>

      <div aria-hidden className="mt-6 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-white/10">
        {total > 0 && (
          <>
            <div className="h-full bg-sky-300" style={{ width: `${cashShare}%` }} />
            <div className="h-full flex-1 bg-emerald-300" />
          </>
        )}
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-primary-100">
            <span aria-hidden className="size-2 rounded-full bg-sky-300" /> Cash balances
          </dt>
          <dd className="font-semibold tabular-nums">{formatMoney(data?.ledger.clientCash)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-primary-100">
            <span aria-hidden className="size-2 rounded-full bg-emerald-300" /> In {data?.plans.active ?? 0} active plan{data?.plans.active === 1 ? "" : "s"}
          </dt>
          <dd className="font-semibold tabular-nums">{formatMoney(data?.ledger.inPlans)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-2.5">
          <dt className="text-primary-100">Reserved for withdrawals</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(data?.ledger.reserved)}</dd>
        </div>
      </dl>

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-sm">
        <div>
          <p className="text-xs text-primary-100">Clients</p>
          <p className="font-semibold tabular-nums">{data?.users.total ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-primary-100">Suspended</p>
          <p className="font-semibold tabular-nums">{data ? data.users.total - data.users.active : "—"}</p>
        </div>
      </div>
    </section>
  )
}

function FlowsCard({ data, loading }: { data: AdminStats | undefined | null; loading: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const series = data?.flows.series ?? []
  const max = Math.max(1, ...series.map((day) => Math.max(cents(day.deposits), cents(day.withdrawals))))
  const net = cents(data?.flows.deposits) - cents(data?.flows.withdrawals)
  const active = hover !== null ? series[hover] : null

  return (
    <section aria-labelledby="flows-title" className={cn(card, "flex min-w-0 flex-col p-5 sm:p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="flows-title" className="font-sans text-base font-semibold">
            Money in and out
          </h3>
          <p className="text-xs text-secondary-500">Last {data?.flows.days ?? 30} days, settled only</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-secondary-600">
          <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-primary-600" /> Deposits</span>
          <span className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-amber-400" /> Withdrawals</span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-secondary-200 sm:grid-cols-4">
        {[
          { label: `Deposits · ${data?.flows.depositCount ?? 0}`, value: formatMoney(data?.flows.deposits), tone: "text-secondary-900" },
          { label: `Withdrawn · ${data?.flows.withdrawalCount ?? 0}`, value: formatMoney(data?.flows.withdrawals), tone: "text-secondary-900" },
          { label: "Returns paid", value: formatMoney(data?.flows.returnsPaid), tone: "text-emerald-600" },
          {
            label: "Net flow",
            value: `${net > 0 ? "+" : net < 0 ? "-" : ""}${formatMoney((Math.abs(net) / 100).toFixed(2))}`,
            tone: net >= 0 ? "text-emerald-600" : "text-red-600",
          },
        ].map((tile) => (
          <div key={tile.label} className="bg-white px-4 py-3">
            <dt className="truncate text-[11px] text-secondary-500">{tile.label}</dt>
            <dd className={cn("mt-0.5 truncate font-heading text-lg font-semibold tabular-nums", tile.tone)}>
              {loading ? <Skeleton className="h-6 w-20" /> : tile.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="relative mt-5 flex-1">
        {loading ? (
          <Skeleton className="h-44 w-full rounded-xl" />
        ) : (
          <>
            <div
              role="img"
              aria-label={`Daily deposits and withdrawals over the last ${series.length} days`}
              className="flex h-44 items-end gap-[3px] border-b border-secondary-200"
              onMouseLeave={() => setHover(null)}
            >
              {series.map((day, index) => (
                <div
                  key={day.date}
                  onMouseEnter={() => setHover(index)}
                  className={cn("flex h-full flex-1 items-end gap-px rounded-t-sm", hover === index && "bg-secondary-100")}
                >
                  <div className="w-1/2 rounded-t-sm bg-primary-600" style={{ height: `${(cents(day.deposits) / max) * 100}%` }} />
                  <div className="w-1/2 rounded-t-sm bg-amber-400" style={{ height: `${(cents(day.withdrawals) / max) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-secondary-400">
              <span>{series[0] ? formatDate(series[0].date) : ""}</span>
              <span>Today</span>
            </div>
            {active && (
              <div className="pointer-events-none absolute top-0 right-0 rounded-xl border border-secondary-200 bg-white px-3 py-2 text-xs shadow-lg">
                <p className="font-semibold">{formatDate(active.date)}</p>
                <p className="mt-0.5 text-secondary-600 tabular-nums">In {formatMoney(active.deposits)}</p>
                <p className="text-secondary-600 tabular-nums">Out {formatMoney(active.withdrawals)}</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-xl" />
      ))}
    </div>
  )
}
