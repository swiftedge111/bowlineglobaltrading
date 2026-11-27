"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog } from "radix-ui"
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Hourglass,
  Layers,
  ListFilter,
  ReceiptText,
  Repeat,
  Search,
  SlidersHorizontal,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type { Transaction, TxCategory, TxStatus, TxType } from "@/lib/api/types"
import { formatMoney } from "@/lib/format"
import { saveCsv, toCsv, today } from "@/lib/csv"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/** Every credit and debit, searchable, filterable, and exportable. */

const PAGE_SIZE = 20

const CATEGORY: Record<TxCategory, { label: string; icon: LucideIcon; tone: string }> = {
  DEPOSIT: { label: "Deposit", icon: ArrowDownToLine, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  WITHDRAWAL: { label: "Withdrawal", icon: ArrowUpFromLine, tone: "bg-secondary-100 text-secondary-600 ring-secondary-200" },
  PLAN_PAYOUT: { label: "Plan return", icon: Repeat, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  PLAN_PRINCIPAL: { label: "Plan principal", icon: Layers, tone: "bg-primary-50 text-primary-700 ring-primary-100" },
  PROFIT: { label: "Trading profit", icon: TrendingUp, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  HOLDING: { label: "Holding", icon: Coins, tone: "bg-violet-50 text-violet-600 ring-violet-100" },
  ADJUSTMENT: { label: "Adjustment", icon: SlidersHorizontal, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
}

const CATEGORY_TABS: Array<{ value: TxCategory | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "DEPOSIT", label: "Deposits" },
  { value: "WITHDRAWAL", label: "Withdrawals" },
  { value: "PLAN_PAYOUT", label: "Plan returns" },
  { value: "PLAN_PRINCIPAL", label: "Plan principal" },
  { value: "PROFIT", label: "Trading profit" },
  { value: "HOLDING", label: "Holdings" },
  { value: "ADJUSTMENT", label: "Adjustments" },
]

const PERIODS = [
  { value: "all", label: "All time", days: null },
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
] as const

type Period = (typeof PERIODS)[number]["value"]

const STATUSES: Array<{ value: TxStatus | ""; label: string }> = [
  { value: "", label: "Any status" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PENDING", label: "Pending" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
]

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

/** Start of the viewer's local day, `days - 1` days ago. */
function localDayStart(daysBack: number) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (daysBack - 1))
  return date.toISOString()
}

const signedAmount = (tx: Transaction) => (tx.type === "DEBIT" ? `-${tx.amount}` : tx.amount)

export function TransactionsScreen() {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [category, setCategory] = useState<TxCategory | "">("")
  const [direction, setDirection] = useState<TxType | "">("")
  const [status, setStatus] = useState<TxStatus | "">("")
  const [period, setPeriod] = useState<Period>("all")
  const [from, setFrom] = useState<string | undefined>()
  const [search, setSearch] = useState("")
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [exporting, setExporting] = useState(false)

  // Search as the person types, without a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const filters: api.TransactionFilters = {
    ...(category ? { category } : {}),
    ...(direction ? { type: direction } : {}),
    ...(status ? { status } : {}),
    ...(from ? { from } : {}),
    ...(q ? { q } : {}),
  }
  const filterKey = `${category}:${direction}:${status}:${from ?? ""}:${q}`
  const filtered = filterKey !== "::::"

  const list = useAsyncData(
    () => api.transactions.list({ ...filters, page, limit: PAGE_SIZE }),
    `tx:${filterKey}:${page}`
  )
  const summary = useAsyncData(() => api.transactions.summary(filters), `tx-summary:${filterKey}`)

  const rows = useMemo(() => list.data?.items ?? [], [list.data])
  const meta = list.data?.meta
  const groups = useMemo(() => groupByDay(rows), [rows])

  function update<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function choosePeriod(value: Period) {
    const days = PERIODS.find((item) => item.value === value)?.days ?? null
    setPeriod(value)
    setFrom(days ? localDayStart(days) : undefined)
    setPage(1)
  }

  function clearAll() {
    setCategory("")
    setDirection("")
    setStatus("")
    setPeriod("all")
    setFrom(undefined)
    setSearch("")
    setQ("")
    setPage(1)
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const all: Transaction[] = []
      // 100 is the API's page cap; 50 pages is far beyond any real account.
      for (let next = 1; next <= 50; next += 1) {
        const result = await api.transactions.list({ ...filters, page: next, limit: 100 })
        all.push(...result.items)
        if (next >= result.meta.pages) break
      }
      downloadCsv(all)
      toast.success("Export ready", `${all.length} transaction${all.length === 1 ? "" : "s"} saved as CSV.`)
    } catch (cause) {
      toast.fromError(cause, "Could not export your transactions.")
    } finally {
      setExporting(false)
    }
  }

  const sum = summary.data

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Transaction{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              history.
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-secondary-600 sm:text-base">
            Every credit and debit on your account. Select a row for its full details.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => void exportCsv()}
          disabled={exporting || (sum?.count ?? 0) === 0}
          className="w-fit border border-secondary-300 bg-white text-secondary-800 hover:border-primary-300 hover:bg-white hover:text-primary-700"
        >
          <Download aria-hidden />
          {exporting ? "Preparing…" : "Export CSV"}
        </Button>
      </div>

      {/* Totals */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-secondary-200 bg-secondary-200 lg:grid-cols-4">
        {[
          { label: "Money in", value: sum ? formatMoney(sum.moneyIn, { showPlus: !isZeroStr(sum.moneyIn) }) : null, icon: ArrowDownLeft, tone: "text-emerald-600", chip: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
          { label: "Money out", value: sum ? (isZeroStr(sum.moneyOut) ? formatMoney(sum.moneyOut) : `-${formatMoney(sum.moneyOut)}`) : null, icon: ArrowUpRight, tone: "text-secondary-900", chip: "bg-secondary-100 text-secondary-600 ring-secondary-200" },
          { label: sum && sum.pending.count > 0 ? `Pending · ${sum.pending.count}` : "Pending", value: sum ? formatMoney(sum.pending.amount) : null, icon: Hourglass, tone: "text-amber-700", chip: "bg-amber-50 text-amber-600 ring-amber-100" },
          { label: "Transactions", value: sum ? sum.count.toLocaleString("en-US") : null, icon: ReceiptText, tone: "text-secondary-900", chip: "bg-primary-50 text-primary-700 ring-primary-100" },
        ].map((tile) => (
          <div key={tile.label} className="flex items-center gap-3 bg-white p-4 sm:p-5">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl ring-1", tile.chip)}>
              <tile.icon aria-hidden className="size-4.5" />
            </span>
            <div className="min-w-0">
              <dt className="truncate text-xs font-medium text-secondary-500">{tile.label}</dt>
              <dd className={cn("truncate font-heading text-lg font-semibold tabular-nums sm:text-xl", tile.tone)}>
                {tile.value ?? <Skeleton className="mt-1 h-6 w-20" />}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      {filtered && (
        <p className="-mt-3 text-xs text-secondary-500">Totals reflect the filters below.</p>
      )}

      {/* Filters + list */}
      <section aria-labelledby="ledger-title" className={cn(card, "overflow-hidden")}>
        <h3 id="ledger-title" className="sr-only">Transactions</h3>

        <div className="space-y-3 border-b border-secondary-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative block flex-1">
              <span className="sr-only">Search transactions</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search descriptions, e.g. Gold plan or bank transfer"
                className="h-10 w-full rounded-xl border border-secondary-200 bg-secondary-50 pr-3 pl-9 text-sm placeholder:text-secondary-400 focus:border-primary-400 focus:bg-white focus:ring-4 focus:ring-primary-100 focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Direction" className="flex rounded-lg bg-secondary-100 p-0.5">
                {([
                  ["", "All"],
                  ["CREDIT", "In"],
                  ["DEBIT", "Out"],
                ] as const).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={direction === value}
                    onClick={() => update(setDirection)(value)}
                    className={cn(
                      "min-h-9 min-w-11 rounded-md px-3 text-xs font-semibold transition-colors",
                      focusRing,
                      direction === value ? "bg-white text-primary-700 shadow-sm" : "text-secondary-600 hover:text-secondary-900"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Select label="Period" value={period} onChange={(value) => choosePeriod(value as Period)} options={PERIODS.map(({ value, label }) => ({ value, label }))} />
              <Select label="Status" value={status} onChange={(value) => update(setStatus)(value as TxStatus | "")} options={STATUSES} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ListFilter aria-hidden className="size-4 shrink-0 text-secondary-400" />
            <div role="tablist" aria-label="Category" className="-my-1 flex gap-1 overflow-x-auto py-1 [scrollbar-width:none]">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.label}
                  type="button"
                  role="tab"
                  aria-selected={category === tab.value}
                  onClick={() => update(setCategory)(tab.value)}
                  className={cn(
                    "min-h-8 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors",
                    focusRing,
                    category === tab.value
                      ? "bg-primary-700 text-white shadow-sm shadow-primary-700/25"
                      : "text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {filtered && (
              <button
                type="button"
                onClick={clearAll}
                className={cn("ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-secondary-500 hover:text-red-600", focusRing)}
              >
                <X aria-hidden className="size-3.5" /> Clear
              </button>
            )}
          </div>
        </div>

        {list.error && !list.data ? (
          <ErrorState title="Could not load your transactions" onRetry={list.reload} className="m-5" />
        ) : list.loading && !list.data ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-secondary-50 text-secondary-400 ring-1 ring-secondary-200">
              <ReceiptText aria-hidden className="size-5" />
            </span>
            <p className="mt-3 font-semibold">{filtered ? "Nothing matches those filters" : "No transactions yet"}</p>
            <p className="mt-1 max-w-sm text-sm text-secondary-600">
              {filtered
                ? "Try a wider period or a different category."
                : "Deposits, plan returns and withdrawals appear here as they happen."}
            </p>
            {filtered && (
              <Button size="sm" variant="ghost" onClick={clearAll} className="mt-4 border border-secondary-300">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className={cn("transition-opacity", list.loading && "opacity-60")}>
            {groups.map((group) => (
              <div key={group.key}>
                <div className="sticky top-16 z-10 flex items-center justify-between gap-3 border-y border-secondary-100 bg-secondary-50/95 px-5 py-2 backdrop-blur first:border-t-0">
                  <p className="text-xs font-semibold text-secondary-700">{group.label}</p>
                  <p className="text-xs text-secondary-500 tabular-nums">
                    {group.count} · net{" "}
                    <span className={cn("font-semibold", group.net > 0 ? "text-emerald-600" : group.net < 0 ? "text-secondary-800" : "")}>
                      {group.net > 0 ? "+" : group.net < 0 ? "-" : ""}
                      {formatMoney((Math.abs(group.net) / 100).toFixed(2))}
                    </span>
                  </p>
                </div>
                <ul className="divide-y divide-secondary-100">
                  {group.rows.map((tx) => (
                    <li key={tx.id}>
                      <TxRow tx={tx} onOpen={() => setSelected(tx)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {meta && meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary-200 px-5 py-3.5">
            <p className="text-xs text-secondary-500 tabular-nums">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of{" "}
              {meta.total.toLocaleString("en-US")}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={meta.page <= 1}
                aria-label="Previous page"
                className={cn("grid size-9 place-items-center rounded-lg border border-secondary-200 text-secondary-600 hover:border-primary-300 hover:text-primary-700 disabled:pointer-events-none disabled:opacity-40", focusRing)}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <span className="min-w-16 text-center text-xs font-semibold text-secondary-700 tabular-nums">
                {meta.page} / {Math.max(meta.pages, 1)}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={meta.page >= meta.pages}
                aria-label="Next page"
                className={cn("grid size-9 place-items-center rounded-lg border border-secondary-200 text-secondary-600 hover:border-primary-300 hover:text-primary-700 disabled:pointer-events-none disabled:opacity-40", focusRing)}
              >
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      <TxDetail tx={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/* -------------------------------------------------------------------- rows */

function TxRow({ tx, onOpen }: { tx: Transaction; onOpen: () => void }) {
  const meta = CATEGORY[tx.category]
  const voided = tx.status === "REJECTED" || tx.status === "CANCELLED"
  const credit = tx.type === "CREDIT"

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors outline-none hover:bg-secondary-50 focus-visible:bg-primary-50/60"
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full ring-1", meta.tone)}>
        <meta.icon aria-hidden className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{tx.description ?? meta.label}</span>
        <span className="block truncate text-xs text-secondary-500">
          {meta.label} · {new Date(tx.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
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
      </span>
    </button>
  )
}

interface DayGroup {
  key: string
  label: string
  rows: Transaction[]
  count: number
  /** Net settled cents for the day. */
  net: number
}

function groupByDay(rows: Transaction[]): DayGroup[] {
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

  const groups: DayGroup[] = []
  for (const tx of rows) {
    const date = new Date(tx.createdAt)
    const key = date.toDateString()
    let group = groups.at(-1)
    if (!group || group.key !== key) {
      const formatted = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" })
      group = {
        key,
        label: sameDay(date, today) ? `Today · ${formatted}` : sameDay(date, yesterday) ? `Yesterday · ${formatted}` : formatted,
        rows: [],
        count: 0,
        net: 0,
      }
      groups.push(group)
    }
    group.rows.push(tx)
    group.count += 1
    if (tx.status === "COMPLETED") {
      const value = Math.round(Number(tx.amount) * 100)
      group.net += tx.type === "CREDIT" ? value : -value
    }
  }
  return groups
}

/* ------------------------------------------------------------------ detail */

function TxDetail({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const meta = tx ? CATEGORY[tx.category] : null
  const extra = tx ? metadataRows(tx) : []

  return (
    <Dialog.Root open={tx !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#092739]/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            theme.bowline,
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white text-secondary-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          )}
        >
          {tx && meta && (
            <>
              <div className="flex items-center justify-between border-b border-secondary-200 px-5 py-4">
                <Dialog.Title className="text-base font-semibold">Transaction details</Dialog.Title>
                <Dialog.Close
                  aria-label="Close"
                  className={cn("grid size-9 place-items-center rounded-lg text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900", focusRing)}
                >
                  <X aria-hidden className="size-5" />
                </Dialog.Close>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                <div className="flex flex-col items-center rounded-[1.25rem] bg-secondary-50 px-5 py-7 text-center ring-1 ring-secondary-200">
                  <span className={cn("grid size-12 place-items-center rounded-full ring-1", meta.tone)}>
                    <meta.icon aria-hidden className="size-5" />
                  </span>
                  <p
                    className={cn(
                      "mt-3 font-heading text-4xl font-semibold tracking-tight tabular-nums",
                      tx.status === "REJECTED" || tx.status === "CANCELLED"
                        ? "text-secondary-400 line-through"
                        : tx.type === "CREDIT"
                          ? "text-emerald-600"
                          : "text-secondary-900"
                    )}
                  >
                    {tx.type === "CREDIT" ? "+" : "-"}
                    {formatMoney(tx.amount)}
                  </p>
                  <Dialog.Description className="mt-1 text-sm text-secondary-600">
                    {tx.description ?? meta.label}
                  </Dialog.Description>
                  <StatusBadge status={tx.status} className="mt-3" />
                </div>

                <dl className="mt-5 divide-y divide-secondary-100 rounded-2xl border border-secondary-200 text-sm">
                  <DetailRow label="Date" value={new Date(tx.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} />
                  <DetailRow label="Category" value={meta.label} />
                  <DetailRow label="Direction" value={tx.type === "CREDIT" ? "Money in" : "Money out"} />
                  {extra.map((row) => (
                    <DetailRow key={row.label} label={row.label} value={row.value} />
                  ))}
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <dt className="shrink-0 text-secondary-500">Reference</dt>
                    <dd className="flex min-w-0 items-center gap-1">
                      <span className="truncate font-mono text-xs font-semibold">{tx.id}</span>
                      <CopyButton value={tx.id} label="Copy transaction reference" />
                    </dd>
                  </div>
                </dl>

                {tx.status === "PENDING" && (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    This is still being reviewed. The amount is set aside and settles once our team
                    confirms it.
                  </p>
                )}
                {(tx.status === "REJECTED" || tx.status === "CANCELLED") && (
                  <p className="mt-4 rounded-xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-600">
                    No money moved. Any amount set aside for this was returned to your available
                    balance.
                  </p>
                )}
                <p className="mt-4 text-xs text-secondary-500">
                  Contacting support about this? Quote the reference above.
                </p>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="shrink-0 text-secondary-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold">{value}</dd>
    </div>
  )
}

/** The parts of a ledger entry's metadata worth showing a client. */
function metadataRows(tx: Transaction): Array<{ label: string; value: string }> {
  const data = (tx.metadata ?? {}) as Record<string, unknown>
  const rows: Array<{ label: string; value: string }> = []
  const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value) : null)

  if (tx.category === "WITHDRAWAL") {
    const net = text(data.netAmount)
    const fee = text(data.fee)
    if (net) rows.push({ label: "Sent to you", value: formatMoney(net) })
    if (fee) rows.push({ label: "Processing fee", value: formatMoney(fee) })
    const destination = (data.destination ?? {}) as Record<string, unknown>
    const wallet = text(destination.walletAddress)
    const account = text(destination.accountNumber)
    if (wallet) {
      rows.push({ label: "To wallet", value: wallet.length > 14 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet })
      const network = text(destination.network)
      if (network) rows.push({ label: "Network", value: network })
    } else if (account) {
      const bank = text(destination.bankName)
      rows.push({ label: "To account", value: `${bank ? `${bank} · ` : ""}•••• ${account.slice(-4)}` })
    }
    const payout = text(data.payoutReference)
    if (payout) rows.push({ label: "Payout reference", value: payout })
  }

  if (tx.category === "PLAN_PAYOUT") {
    const period = text(data.period)
    if (period) rows.push({ label: "Plan day", value: `Day ${period}` })
  }

  return rows
}

/* ------------------------------------------------------------------ export */

function isZeroStr(value: string) {
  return Number(value) === 0
}

function downloadCsv(rows: Transaction[]) {
  const header = ["Date", "Description", "Category", "Direction", "Status", "Amount (USD)", "Reference"]
  const body = rows.map((tx) => [
    new Date(tx.createdAt).toISOString(),
    tx.description,
    CATEGORY[tx.category].label,
    tx.type === "CREDIT" ? "In" : "Out",
    tx.status.charAt(0) + tx.status.slice(1).toLowerCase(),
    signedAmount(tx),
    tx.id,
  ])
  saveCsv(`bowline-transactions-${today()}.csv`, toCsv(header, body))
}

/* ------------------------------------------------------------------ select */

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-10 appearance-none rounded-lg border bg-white pr-8 pl-3 text-xs font-semibold transition-colors",
          focusRing,
          value && value !== "all" ? "border-primary-300 text-primary-700" : "border-secondary-200 text-secondary-700"
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronRight aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 rotate-90 text-secondary-400" />
    </label>
  )
}
