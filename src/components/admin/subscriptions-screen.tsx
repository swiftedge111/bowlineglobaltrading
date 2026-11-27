"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Dialog } from "radix-ui"
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Hourglass,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  TrendingUp,
  X,
  Zap,
} from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { Badge, card, focusRing, PagerButton, plural, Tile } from "@/components/admin/queue-parts"
import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type { AdminSubscriptionRow, AdminSubscriptionSort, AdminSubscriptionView, SubscriptionStatus } from "@/lib/api/types"
import { saveCsv, toCsv, today } from "@/lib/csv"
import { formatDate, formatDateTime, formatMoney, formatRelative } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { countdown, useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

/**
 * Every plan subscription: what the book is worth, what it pays a day, what
 * it still owes and what comes due this week.
 *
 * Payouts run hourly. A subscription the job has fallen behind on is flagged
 * and can be paid on the spot; the same guarded path runs either way, so a
 * period is never paid twice. Cancelling returns the principal exactly as a
 * client's own cancellation does, after settling anything already earned.
 */

const PAGE_SIZE = 20

type Tab = {
  key: string
  label: string
  status?: SubscriptionStatus
  view?: AdminSubscriptionView
}

const TABS: Tab[] = [
  { key: "running", label: "Running", status: "ACTIVE" },
  { key: "maturing", label: "Maturing in 7 days", view: "maturing" },
  { key: "behind", label: "Payout late", view: "behind" },
  { key: "completed", label: "Completed", status: "COMPLETED" },
  { key: "cancelled", label: "Cancelled", status: "CANCELLED" },
  { key: "all", label: "All" },
]

const SORTS: Array<{ value: AdminSubscriptionSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "ending", label: "Ending soonest" },
  { value: "largest", label: "Largest first" },
]

export function AdminSubscriptionsScreen() {
  const [tabKey, setTabKey] = useState("running")
  const [planId, setPlanId] = useState("")
  const [sort, setSort] = useState<AdminSubscriptionSort>("newest")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<AdminSubscriptionRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const toast = useToast()
  const now = useNow(60_000)

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const tab = TABS.find((item) => item.key === tabKey) ?? TABS[0]
  const filters = {
    ...(tab.status ? { status: tab.status } : {}),
    ...(tab.view ? { view: tab.view } : {}),
    ...(planId ? { planId } : {}),
    ...(query ? { search: query } : {}),
    sort,
  }

  const summary = useAsyncData(() => api.admin.subscriptionSummary(), `subscription-summary:${refreshKey}`)
  const list = useAsyncData(
    () => api.admin.subscriptions({ page, limit: PAGE_SIZE, ...filters }),
    `admin-subscriptions:${tabKey}:${planId}:${query}:${sort}:${page}:${refreshKey}`
  )

  const rows = list.data?.items ?? []
  const meta = list.data?.meta
  const s = summary.data
  const summaryLoading = summary.loading && !s
  const filtered = Boolean(query || planId)

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function changed() {
    setSelected(null)
    refresh()
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const all: AdminSubscriptionRow[] = []
      for (let next = 1; ; next += 1) {
        const result = await api.admin.subscriptions({ page: next, limit: 100, ...filters })
        all.push(...result.items)
        if (next >= result.meta.pages || next >= 50) break
      }
      const csv = toCsv(
        [
          "Subscription ID",
          "Client",
          "Account ID",
          "Email",
          "Plan",
          "Status",
          "Principal",
          "Daily rate %",
          "Daily payout",
          "Days paid",
          "Term days",
          "Earned",
          "Still owed",
          "Started",
          "Ends",
          "Closed",
        ],
        all.map((row) => [
          row.id,
          row.user.fullName,
          row.user.uid,
          row.user.email,
          row.planName,
          row.status,
          row.principal,
          row.dailyReturnPercent,
          row.dailyPayout,
          row.paidPeriods,
          row.totalPeriods,
          row.totalAccrued,
          row.owedToMaturity,
          row.startedAt,
          row.endsAt,
          row.closedAt,
        ])
      )
      saveCsv(`bowline-subscriptions-${tab.key}-${today()}.csv`, csv)
    } catch (cause) {
      toast.fromError(cause, "Could not export subscriptions.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Plan <span className="inline-block font-serif font-normal text-primary-600 italic">subscriptions.</span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">Returns pay out every 24 hours from each start time. Principal comes back at maturity.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh"
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-xl border border-secondary-200 bg-white px-3.5 text-sm font-semibold text-secondary-800 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-700 sm:px-4",
              focusRing
            )}
          >
            <RefreshCw aria-hidden className={cn("size-4", list.loading && list.data && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={exporting || !meta || meta.total === 0}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-xl border border-secondary-200 bg-white px-4 text-sm font-semibold text-secondary-800 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-700 disabled:pointer-events-none disabled:opacity-50",
              focusRing
            )}
          >
            {exporting ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
            Export CSV
          </button>
        </div>
      </div>

      {s && s.behind > 0 && tabKey !== "behind" && (
        <div className="flex flex-col gap-3 rounded-[1.25rem] border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold text-amber-900">
                {plural(s.behind, "subscription")} {s.behind === 1 ? "is" : "are"} behind on payouts
              </p>
              <p className="mt-0.5 text-amber-800">The hourly payout job may not be running. You can pay each one now from its details.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setTabKey("behind")
              setPage(1)
            }}
            className={cn(
              "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700",
              focusRing
            )}
          >
            Review
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile
          icon={Layers}
          label="Principal in plans"
          value={s ? formatMoney(s.active.principal) : undefined}
          sub={s ? `${plural(s.active.count, "running plan")}` : undefined}
          loading={summaryLoading}
        />
        <Tile
          icon={CircleDollarSign}
          label="Paid out per day"
          value={s ? formatMoney(s.active.dailyPayout) : undefined}
          sub="Across running plans"
          tone="good"
          loading={summaryLoading}
        />
        <Tile
          icon={TrendingUp}
          label="Returns still owed"
          value={s ? formatMoney(s.active.owedToMaturity) : undefined}
          sub="Until running plans mature"
          loading={summaryLoading}
        />
        <Tile
          icon={CalendarClock}
          label="Maturing in 7 days"
          value={s ? formatMoney(s.maturing7d.principal) : undefined}
          sub={
            s
              ? s.maturing7d.count > 0
                ? `${plural(s.maturing7d.count, "plan")} · ${formatMoney(s.maturing7d.returns)} returns left`
                : "Nothing due this week"
              : undefined
          }
          tone={s && s.maturing7d.count > 0 ? "warn" : "plain"}
          loading={summaryLoading}
        />
      </dl>

      <section className={cn(card, "overflow-hidden")}>
        <div className="border-b border-secondary-200 px-3 pt-3 sm:px-5">
          <div role="tablist" aria-label="Subscriptions" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {TABS.map((item) => {
              const active = tabKey === item.key
              const count =
                item.key === "running" ? s?.active.count : item.key === "maturing" ? s?.maturing7d.count : item.key === "behind" ? s?.behind : undefined
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTabKey(item.key)
                    setPage(1)
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                    focusRing,
                    active ? "border-primary-600 text-primary-700" : "border-transparent text-secondary-500 hover:text-secondary-800"
                  )}
                >
                  {item.label}
                  {count !== undefined && count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                        item.key === "behind" ? "bg-amber-100 text-amber-800" : "bg-secondary-100 text-secondary-700"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-secondary-200 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-400" />
            <label htmlFor="subscription-search" className="sr-only">
              Search subscriptions
            </label>
            <input
              id="subscription-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Client name, email or account ID"
              className="h-11 w-full rounded-xl border border-secondary-200 bg-secondary-50/60 pr-10 pl-10 text-sm transition-colors outline-none placeholder:text-secondary-400 focus-visible:border-primary-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary-100 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className={cn(
                  "absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-secondary-400 hover:bg-secondary-100 hover:text-secondary-700",
                  focusRing
                )}
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Select
              label="Plan"
              value={planId}
              active={Boolean(planId)}
              onChange={(value) => {
                setPlanId(value)
                setPage(1)
              }}
              options={[{ value: "", label: "All plans" }, ...(s?.plans ?? []).map((plan) => ({ value: plan.id, label: plan.name }))]}
            />
            <Select
              label="Sort"
              value={sort}
              active={false}
              onChange={(value) => {
                setSort(value as AdminSubscriptionSort)
                setPage(1)
              }}
              options={SORTS}
            />
          </div>
        </div>

        {list.error && !list.data ? (
          <div className="p-5">
            <ErrorState title="Could not load subscriptions" onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
              <Layers aria-hidden className="size-6" />
            </span>
            <p className="mt-4 font-semibold">{emptyTitle(tab.key, filtered)}</p>
            <p className="mt-1 max-w-sm text-sm text-secondary-600">{filtered ? "Try another plan or search." : emptyBody(tab.key)}</p>
          </div>
        ) : (
          <ul className="divide-y divide-secondary-100">
            {rows.map((row) => (
              <SubscriptionRow key={row.id} row={row} now={now} onOpen={() => setSelected(row)} />
            ))}
          </ul>
        )}

        {meta && meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary-200 px-5 py-3.5">
            <p className="text-xs text-secondary-500 tabular-nums">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total.toLocaleString("en-US")}
            </p>
            <div className="flex items-center gap-1.5">
              <PagerButton label="Previous page" disabled={meta.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft aria-hidden className="size-4" />
              </PagerButton>
              <span className="min-w-16 text-center text-xs font-semibold text-secondary-700 tabular-nums">
                {meta.page} / {Math.max(meta.pages, 1)}
              </span>
              <PagerButton label="Next page" disabled={meta.page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight aria-hidden className="size-4" />
              </PagerButton>
            </div>
          </div>
        )}
      </section>

      <SubscriptionSheet key={selected?.id ?? "none"} subscription={selected} now={now} onClose={() => setSelected(null)} onChanged={changed} />
    </div>
  )
}

function emptyTitle(tab: string, filtered: boolean) {
  if (filtered) return "No subscriptions match"
  if (tab === "behind") return "Every payout is on time"
  if (tab === "maturing") return "Nothing matures this week"
  if (tab === "running") return "No running plans"
  return "No subscriptions here"
}

function emptyBody(tab: string) {
  if (tab === "behind") return "The hourly job is keeping up. Anything more than two hours late shows here."
  if (tab === "maturing") return "Plans ending in the next seven days show here, with the principal due back."
  if (tab === "running") return "Plans appear here as soon as a client subscribes."
  return "Try another tab."
}

function Select({
  label,
  value,
  active,
  options,
  onChange,
}: {
  label: string
  value: string
  active: boolean
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="relative min-w-0 shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-11 w-full appearance-none truncate rounded-xl border bg-white pr-9 pl-3.5 text-sm font-semibold sm:w-auto",
          focusRing,
          active ? "border-primary-300 text-primary-700" : "border-secondary-200 text-secondary-700"
        )}
      >
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronRight aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 rotate-90 text-secondary-400" />
    </label>
  )
}

/* -------------------------------------------------------------------- list */

function Progress({ paid, total, className }: { paid: number; total: number; className?: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={paid}
      aria-label={`${paid} of ${total} days paid`}
      className={cn("block h-1.5 overflow-hidden rounded-full bg-secondary-100", className)}
    >
      <span className="block h-full rounded-full bg-primary-500" style={{ width: `${percent}%` }} />
    </span>
  )
}

function SubscriptionRow({ row, now, onOpen }: { row: AdminSubscriptionRow; now: number; onOpen: () => void }) {
  const active = row.status === "ACTIVE"
  const olderRate = active && row.dailyReturnPercent !== row.planDailyReturnPercent
  const maturingSoon = active && new Date(row.endsAt).getTime() - now < 7 * 24 * 60 * 60 * 1000

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-primary-50/40 focus-visible:bg-primary-50/60 focus-visible:outline-none sm:gap-4 sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{row.user.fullName}</span>
            <span className="hidden font-mono text-[11px] font-semibold text-secondary-400 sm:inline">{row.user.uid}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-secondary-500">
            {row.planName} · {row.dailyReturnPercent}% a day · {formatMoney(row.dailyPayout)}/day
          </span>
          {active ? (
            <span className="mt-2 flex items-center gap-2">
              <Progress paid={row.paidPeriods} total={row.totalPeriods} className="w-24 sm:w-40" />
              <span className="text-[11px] text-secondary-500 tabular-nums">
                Day {row.paidPeriods}/{row.totalPeriods}
              </span>
            </span>
          ) : (
            <span className="mt-1 block text-[11px] text-secondary-500">
              {row.status === "COMPLETED" ? "Matured" : "Cancelled"} {row.closedAt ? formatDate(row.closedAt) : ""} · earned {formatMoney(row.totalAccrued)}
            </span>
          )}
          {(row.behind || olderRate || maturingSoon) && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {row.behind && (
                <Badge tone="warn">
                  <AlertTriangle aria-hidden className="size-3" /> Payout late
                </Badge>
              )}
              {maturingSoon && (
                <Badge tone="info">
                  <CalendarClock aria-hidden className="size-3" /> Ends {formatDate(row.endsAt)}
                </Badge>
              )}
              {olderRate && (
                <Badge tone="info">
                  <Lock aria-hidden className="size-3" /> Locked at {row.dailyReturnPercent}%
                </Badge>
              )}
            </span>
          )}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-base font-semibold tabular-nums sm:text-lg">{formatMoney(row.principal)}</span>
          {active ? (
            <span className="text-[11px] text-secondary-500 tabular-nums">{formatMoney(row.totalAccrued)} earned</span>
          ) : (
            <StatusBadge status={row.status} className="px-2 py-0.5 text-[11px]" />
          )}
        </span>

        <ChevronRight aria-hidden className="hidden size-4 shrink-0 text-secondary-400 group-hover:text-primary-700 sm:block" />
      </button>
    </li>
  )
}

/* ------------------------------------------------------------ detail sheet */

function SubscriptionSheet({
  subscription,
  now,
  onClose,
  onChanged,
}: {
  subscription: AdminSubscriptionRow | null
  now: number
  onClose: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState<"settle" | "cancel" | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState("")

  if (!subscription) return <Dialog.Root open={false} />

  const sub = subscription
  const active = sub.status === "ACTIVE"
  const olderRate = sub.dailyReturnPercent !== sub.planDailyReturnPercent
  const totalAtMaturity = (Number(sub.totalAccrued) + Number(sub.owedToMaturity)).toFixed(2)
  const unpaidAmount = (Number(sub.dailyPayout) * sub.unpaidPeriods).toFixed(2)
  const forfeited = Math.max(0, Number(sub.owedToMaturity) - Number(unpaidAmount)).toFixed(2)
  const next = sub.nextPayoutAt ? countdown(sub.nextPayoutAt, now) : null

  async function settle() {
    setBusy("settle")
    try {
      const result = await api.admin.settleSubscription(sub.id)
      if (result.periodsPaid === 0 && !result.matured) {
        toast.success("Already up to date", "Nothing was owed on this subscription.")
      } else {
        toast.success(
          result.matured ? "Plan completed" : "Payout sent",
          result.matured
            ? `${formatMoney(result.credited)} in returns and the principal are in ${sub.user.fullName}'s balance.`
            : `${formatMoney(result.credited)} for ${plural(result.periodsPaid, "day")} credited to ${sub.user.fullName}.`
        )
      }
      onChanged()
    } catch (cause) {
      toast.fromError(cause, "Could not pay this subscription.")
    } finally {
      setBusy(null)
    }
  }

  async function cancel() {
    setBusy("cancel")
    try {
      await api.admin.cancelSubscription(sub.id, { reason: reason.trim() || undefined })
      toast.success("Subscription cancelled", `${formatMoney(sub.principal)} principal returned to ${sub.user.fullName}.`)
      onChanged()
    } catch (cause) {
      toast.fromError(cause, "Could not cancel that subscription.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#092739]/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            theme.bowline,
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-secondary-50 text-secondary-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-secondary-200 bg-white px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold">{sub.planName} subscription</Dialog.Title>
              <p className="text-xs text-secondary-500">Started {formatDateTime(sub.startedAt)}</p>
            </div>
            <Dialog.Close
              aria-label="Close"
              disabled={Boolean(busy)}
              className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-secondary-500 hover:bg-secondary-100", focusRing)}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <section className="relative isolate overflow-hidden rounded-[1.25rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-5 text-white">
              <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 -z-10 size-44 rounded-full bg-sky-400/20 blur-3xl" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">Principal</p>
                  <p className="mt-1 font-heading text-4xl font-medium tracking-tight tabular-nums">{formatMoney(sub.principal)}</p>
                </div>
                <StatusBadge status={sub.status} />
              </div>
              <div className="mt-5">
                <div className="flex justify-between text-xs text-sky-100 tabular-nums">
                  <span>
                    Day {sub.paidPeriods} of {sub.totalPeriods}
                  </span>
                  <span>Ends {formatDate(sub.endsAt)}</span>
                </div>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-white/15">
                  <span
                    className="block h-full rounded-full bg-sky-300"
                    style={{ width: `${sub.totalPeriods ? Math.min(100, (sub.paidPeriods / sub.totalPeriods) * 100) : 0}%` }}
                  />
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-[11px] text-sky-200">Earned</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(sub.totalAccrued)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-sky-200">Still owed</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(sub.owedToMaturity)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-sky-200">At maturity</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(active ? totalAtMaturity : sub.totalAccrued)}</dd>
                </div>
              </dl>
            </section>

            {active && sub.behind && (
              <section className="rounded-[1.25rem] border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-600" />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-amber-900">
                      {sub.unpaidPeriods > 0 ? `${plural(sub.unpaidPeriods, "day")} earned but not paid (${formatMoney(unpaidAmount)})` : "Maturity is overdue"}
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      The hourly job should have paid this. Paying now credits each day dated to when it was earned, and is safe to press even if the job runs
                      at the same moment.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void settle()}
                  disabled={Boolean(busy)}
                  className={cn(
                    "mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60",
                    focusRing
                  )}
                >
                  {busy === "settle" ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Zap aria-hidden className="size-4" />}
                  Pay what&apos;s owed now
                </button>
              </section>
            )}

            <section className={cn(card, "p-5")}>
              <h3 className="text-sm font-semibold">Terms</h3>
              <dl className="mt-3 grid grid-cols-1 gap-y-2.5 text-sm">
                <Fact label="Daily rate">
                  {sub.dailyReturnPercent}%
                  {olderRate && <span className="ml-1.5 text-xs font-normal text-secondary-500">(plan now {sub.planDailyReturnPercent}%)</span>}
                </Fact>
                <Fact label="Pays per day">{formatMoney(sub.dailyPayout)}</Fact>
                <Fact label="Term">{plural(sub.totalPeriods, "day")}</Fact>
                {active && (
                  <Fact label="Next payout">{sub.nextPayoutAt ? (next ? `in ${next}` : `due ${formatRelative(sub.nextPayoutAt)}`) : "At maturity"}</Fact>
                )}
                <Fact label="Last paid">{sub.lastAccruedOn ? formatDateTime(sub.lastAccruedOn) : "Not yet"}</Fact>
                {sub.closedAt && <Fact label={sub.status === "COMPLETED" ? "Matured" : "Cancelled"}>{formatDateTime(sub.closedAt)}</Fact>}
              </dl>
              {olderRate && active && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-xs text-primary-800">
                  <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  This client keeps the rate they signed up at. The plan&apos;s new rate applies to new subscriptions only.
                </p>
              )}
            </section>

            <section className={cn(card, "p-5")}>
              <h3 className="text-sm font-semibold">Client</h3>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{sub.user.fullName}</p>
                  <p className="truncate text-xs text-secondary-500">
                    {sub.user.email} · <span className="font-mono">{sub.user.uid}</span>
                  </p>
                </div>
                <Link
                  href={`/admin/users/${sub.user.uid}`}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-secondary-200 px-3 text-xs font-semibold text-secondary-700 hover:border-primary-300 hover:text-primary-700",
                    focusRing
                  )}
                >
                  Profile
                  <ChevronRight aria-hidden className="size-3.5" />
                </Link>
              </div>
            </section>

            {active && cancelling && (
              <section className="rounded-[1.25rem] border border-red-200 bg-red-50/60 p-4">
                <p className="text-sm font-semibold text-red-900">Cancel this subscription?</p>
                <ul className="mt-2 space-y-1 text-sm text-red-900/80">
                  <li>· {formatMoney(sub.principal)} principal goes back to the client&apos;s balance.</li>
                  {sub.unpaidPeriods > 0 && <li>· {formatMoney(unpaidAmount)} already earned is paid first.</li>}
                  <li>· {formatMoney(forfeited)} of future returns is forfeited.</li>
                  <li>· The client gets the cancellation email.</li>
                </ul>
                <label htmlFor="cancel-reason" className="mt-3 block text-xs font-semibold text-red-900">
                  Reason <span className="font-normal text-red-900/70">(kept in the audit log)</span>
                </label>
                <textarea
                  id="cancel-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="e.g. Client asked by phone to exit early"
                  className="mt-1.5 w-full resize-none rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-secondary-400 focus-visible:border-red-400 focus-visible:ring-4 focus-visible:ring-red-100"
                />
              </section>
            )}
          </div>

          {active && (
            <div className="flex gap-2 border-t border-secondary-200 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {cancelling ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCancelling(false)}
                    disabled={Boolean(busy)}
                    className={cn(
                      "h-11 flex-1 rounded-xl border border-secondary-200 text-sm font-semibold text-secondary-700 hover:bg-secondary-50",
                      focusRing
                    )}
                  >
                    Keep it running
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancel()}
                    disabled={Boolean(busy)}
                    className={cn(
                      "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60",
                      focusRing
                    )}
                  >
                    {busy === "cancel" && <Loader2 aria-hidden className="size-4 animate-spin" />}
                    Cancel and refund
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setCancelling(true)}
                  className={cn(
                    "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-50",
                    focusRing
                  )}
                >
                  <Hourglass aria-hidden className="size-4" />
                  Cancel subscription
                </button>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-secondary-500">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{children}</dd>
    </div>
  )
}
