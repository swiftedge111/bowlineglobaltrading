"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Dialog } from "radix-ui"
import {
  AlertTriangle,
  ArrowUpFromLine,
  Bitcoin,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Landmark,
  Loader2,
  MapPinned,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { Badge, card, focusRing, PagerButton, plural, Tile, waited } from "@/components/admin/queue-parts"
import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { CopyButton } from "@/components/ui/copy-button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { notifyQueuesChanged } from "@/lib/admin-events"
import * as api from "@/lib/api/endpoints"
import type {
  AdminWithdrawalRow,
  CryptoDestination,
  RequestStatus,
  WithdrawalDestination,
  WithdrawalMethod,
} from "@/lib/api/types"
import { formatDateTime, formatMoney, formatRelative, initials } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

/**
 * The withdrawal queue. The client's money is already reserved; the desk pays
 * them outside the platform, then approves here to settle the reservation, or
 * rejects to hand it back.
 *
 * Each request carries the signals worth a second look before money leaves:
 * a first payout, a wallet or account never paid before, and a request larger
 * than everything the client has deposited.
 */

const PAGE_SIZE = 20

/** A request waiting longer than this gets flagged in the list. */
const SLOW_MS = 24 * 60 * 60 * 1000

const STATUS_TABS: Array<{ value: RequestStatus | ""; label: string }> = [
  { value: "PENDING", label: "To pay" },
  { value: "APPROVED", label: "Paid" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
]

const METHOD_OPTIONS: Array<{ value: WithdrawalMethod | ""; label: string }> = [
  { value: "", label: "All methods" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "BANK", label: "Bank transfer" },
]

function isCrypto(destination: WithdrawalDestination): destination is CryptoDestination {
  return "walletAddress" in destination
}

/** "USDT · TRC20 · TQn9Y2…bLSE" or "Chase · •••• 4821". */
function destinationLine(destination: WithdrawalDestination) {
  if (isCrypto(destination)) {
    const address = destination.walletAddress
    const short = address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
    return [destination.currency, destination.network, short].filter(Boolean).join(" · ")
  }
  return `${destination.bankName} · •••• ${destination.accountNumber.slice(-4)}`
}

export function AdminWithdrawalsScreen() {
  const [status, setStatus] = useState<RequestStatus | "">("PENDING")
  const [method, setMethod] = useState<WithdrawalMethod | "">("")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<AdminWithdrawalRow | null>(null)
  const now = useNow(60_000)

  // One request when typing stops, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const summary = useAsyncData(() => api.admin.withdrawalSummary(), `withdrawal-summary:${refreshKey}`)
  const list = useAsyncData(
    () =>
      api.admin.withdrawals({
        page,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(method ? { method } : {}),
        ...(query ? { search: query } : {}),
      }),
    `admin-withdrawals:${status}:${method}:${query}:${page}:${refreshKey}`
  )

  const rows = list.data?.items ?? []
  const meta = list.data?.meta
  const s = summary.data
  const summaryLoading = summary.loading && !s
  const filtered = Boolean(query || method)

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  function decided() {
    setSelected(null)
    refresh()
    notifyQueuesChanged()
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Withdrawal{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">payouts.</span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            Send the money first, then approve. Rejecting returns it to the client&apos;s balance.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-xl border border-secondary-200 bg-white px-4 text-sm font-semibold text-secondary-800 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-700",
            focusRing
          )}
        >
          <RefreshCw aria-hidden className={cn("size-4", list.loading && list.data && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* At a glance */}
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile
          icon={Clock}
          label="To pay out"
          value={s ? formatMoney(s.pending.amount) : undefined}
          sub={
            s
              ? s.pending.count > 0
                ? `${plural(s.pending.count, "request")} · oldest ${waited(s.pending.oldestAt, now)}`
                : "Queue is clear"
              : undefined
          }
          tone={s && s.pending.count > 0 ? "warn" : "plain"}
          loading={summaryLoading}
        />
        <Tile
          icon={CheckCircle2}
          label="Paid today"
          value={s ? formatMoney(s.paidToday.amount) : undefined}
          sub={s ? plural(s.paidToday.count, "payout") : undefined}
          tone="good"
          loading={summaryLoading}
        />
        <Tile
          icon={ArrowUpFromLine}
          label="Paid, 30 days"
          value={s ? formatMoney(s.paid30d.amount) : undefined}
          sub={s ? `${formatMoney(s.paid30d.fees)} in fees` : undefined}
          loading={summaryLoading}
        />
        <Tile
          icon={XCircle}
          label="Rejected, 30 days"
          value={s ? String(s.rejected30d) : undefined}
          sub="Funds returned to clients"
          loading={summaryLoading}
        />
      </dl>

      <section className={cn(card, "overflow-hidden")}>
        <div className="border-b border-secondary-200 px-3 pt-3 sm:px-5">
          <div role="tablist" aria-label="Status" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {STATUS_TABS.map((tab) => {
              const active = status === tab.value
              return (
                <button
                  key={tab.value || "all"}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setStatus(tab.value)
                    setPage(1)
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                    focusRing,
                    active ? "border-primary-600 text-primary-700" : "border-transparent text-secondary-500 hover:text-secondary-800"
                  )}
                >
                  {tab.label}
                  {tab.value === "PENDING" && s && s.pending.count > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 tabular-nums">
                      {s.pending.count}
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
            <label htmlFor="withdrawal-search" className="sr-only">
              Search withdrawals
            </label>
            <input
              id="withdrawal-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Client, account ID, wallet or account number"
              className="h-11 w-full rounded-xl border border-secondary-200 bg-secondary-50/60 pr-10 pl-10 text-sm transition-colors outline-none placeholder:text-secondary-400 focus-visible:border-primary-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary-100 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className={cn("absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-secondary-400 hover:bg-secondary-100 hover:text-secondary-700", focusRing)}
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          <label className="relative shrink-0">
            <span className="sr-only">Payout method</span>
            <select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as WithdrawalMethod | "")
                setPage(1)
              }}
              className={cn(
                "h-11 w-full appearance-none rounded-xl border bg-white pr-9 pl-3.5 text-sm font-semibold sm:w-auto",
                focusRing,
                method ? "border-primary-300 text-primary-700" : "border-secondary-200 text-secondary-700"
              )}
            >
              {METHOD_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronRight aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 rotate-90 text-secondary-400" />
          </label>
        </div>

        {list.error && !list.data ? (
          <div className="p-5">
            <ErrorState title="Could not load withdrawals" onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              {status === "PENDING" && !filtered ? <CheckCircle2 aria-hidden className="size-6" /> : <ArrowUpFromLine aria-hidden className="size-6" />}
            </span>
            <p className="mt-4 font-semibold">{status === "PENDING" && !filtered ? "Nothing to pay" : "No withdrawals match"}</p>
            <p className="mt-1 max-w-sm text-sm text-secondary-600">
              {status === "PENDING" && !filtered
                ? "Requests land here the moment a client submits one with a valid PIN."
                : "Try another status, method or search."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-secondary-100">
            {rows.map((row) => (
              <WithdrawalRow key={row.id} row={row} now={now} onOpen={() => setSelected(row)} />
            ))}
          </ul>
        )}

        {meta && meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary-200 px-5 py-3.5">
            <p className="text-xs text-secondary-500 tabular-nums">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of{" "}
              {meta.total.toLocaleString("en-US")}
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

      <PayoutSheet
        // Remount per request so the form never carries one payout's state
        // into the next.
        key={selected?.id ?? "none"}
        withdrawal={selected}
        onClose={() => setSelected(null)}
        onDecided={decided}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- list */

function WithdrawalRow({ row, now, onOpen }: { row: AdminWithdrawalRow; now: number; onOpen: () => void }) {
  const pending = row.status === "PENDING"
  const slow = pending && now - new Date(row.createdAt).getTime() > SLOW_MS
  const Method = row.method === "CRYPTO" ? Bitcoin : Landmark

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-primary-50/40 focus-visible:bg-primary-50/60 focus-visible:outline-none sm:gap-4 sm:px-5"
      >
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl ring-1",
            pending ? "bg-amber-50 text-amber-600 ring-amber-200" : "bg-secondary-50 text-secondary-500 ring-secondary-200"
          )}
        >
          <Method aria-hidden className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{row.user.fullName}</span>
            <span className="hidden font-mono text-[11px] font-semibold text-secondary-400 sm:inline">{row.user.uid}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-secondary-500">{destinationLine(row.destination)}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {pending && row.signals.previousPayouts === 0 && (
              <Badge tone="info">
                <Sparkles aria-hidden className="size-3" /> First withdrawal
              </Badge>
            )}
            {pending && row.signals.previousPayouts > 0 && row.signals.newDestination && (
              <Badge tone="warn">
                <MapPinned aria-hidden className="size-3" /> New destination
              </Badge>
            )}
            {pending && row.signals.exceedsDeposits && (
              <Badge tone="warn">
                <TrendingUp aria-hidden className="size-3" /> Above deposits
              </Badge>
            )}
            {slow && (
              <Badge tone="warn">
                <AlertTriangle aria-hidden className="size-3" /> Waiting {waited(row.createdAt, now)}
              </Badge>
            )}
            {!pending && row.reviewedBy && (
              <span className="text-[11px] text-secondary-500">
                {row.status === "APPROVED" ? "Paid" : row.status === "REJECTED" ? "Rejected" : "Closed"} by {row.reviewedBy}
                {row.reviewedAt ? ` · ${formatRelative(row.reviewedAt)}` : ""}
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-base font-semibold tabular-nums sm:text-lg">{formatMoney(row.amount)}</span>
          {pending ? (
            <span className="text-[11px] text-secondary-500 tabular-nums">+{formatMoney(row.fee)} fee</span>
          ) : (
            <StatusBadge status={row.status} className="px-2 py-0.5 text-[11px]" />
          )}
        </span>

        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-semibold sm:inline-flex",
            pending ? "bg-primary-700 text-white group-hover:bg-primary-800" : "text-secondary-500 group-hover:text-primary-700"
          )}
        >
          {pending ? "Pay" : "Details"}
          <ChevronRight aria-hidden className="size-3.5" />
        </span>
      </button>
    </li>
  )
}

/* ------------------------------------------------------------ payout sheet */

const REJECT_REASONS = [
  "The destination details look incorrect. Please submit a new request.",
  "We could not verify this request. Please contact support.",
  "Your account needs further verification before withdrawing.",
  "This looks like a duplicate of another request.",
]

function PayoutSheet({
  withdrawal,
  onClose,
  onDecided,
}: {
  withdrawal: AdminWithdrawalRow | null
  onClose: () => void
  onDecided: () => void
}) {
  const toast = useToast()
  const [decision, setDecision] = useState<"approve" | "reject">("approve")
  const [sent, setSent] = useState(false)
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  if (!withdrawal) return <Dialog.Root open={false} />

  const w = withdrawal
  const pending = w.status === "PENDING"
  const crypto = isCrypto(w.destination)
  const referenceValid = reference.trim() === "" || reference.trim().length >= 2
  const canSubmit = decision === "approve" ? sent && referenceValid : note.trim().length > 0

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      await api.admin.processWithdrawal(w.id, {
        action: decision,
        note: note.trim() || undefined,
        payoutReference: decision === "approve" ? reference.trim() || undefined : undefined,
      })
      toast.success(
        decision === "approve" ? "Withdrawal marked as paid" : "Withdrawal rejected",
        decision === "approve"
          ? `${formatMoney(w.total)} settled from ${w.user.fullName}'s balance.`
          : `${formatMoney(w.total)} is back in their available balance.`
      )
      onDecided()
    } catch (cause) {
      toast.fromError(cause, "Could not process that withdrawal.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && !busy && onClose()}>
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
              <Dialog.Title className="truncate text-base font-semibold">{pending ? "Pay this withdrawal" : "Withdrawal details"}</Dialog.Title>
              <p className="text-xs text-secondary-500">Requested {formatDateTime(w.createdAt)}</p>
            </div>
            <Dialog.Close
              aria-label="Close"
              disabled={busy}
              className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-secondary-500 hover:bg-secondary-100", focusRing)}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {/* Amount */}
            <section className="relative isolate overflow-hidden rounded-[1.25rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-5 text-white">
              <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 -z-10 size-44 rounded-full bg-sky-400/20 blur-3xl" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">{pending ? "Send the client" : "Client receives"}</p>
                  <p className="mt-1 font-heading text-4xl font-medium tracking-tight tabular-nums">{formatMoney(w.amount)}</p>
                </div>
                <StatusBadge status={w.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-sm">
                <div>
                  <dt className="text-xs text-primary-100">Fee kept</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(w.fee)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-primary-100">Taken from balance</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(w.total)}</dd>
                </div>
              </dl>
            </section>

            {/* Destination */}
            <section className="rounded-2xl bg-white p-4 ring-1 ring-secondary-200">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                {crypto ? <Bitcoin aria-hidden className="size-4 text-primary-600" /> : <Landmark aria-hidden className="size-4 text-primary-600" />}
                {pending ? "Pay to" : "Paid to"}
              </h3>
              {pending && w.signals.previousPayouts > 0 && w.signals.newDestination && (
                <p className="mt-2 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  <MapPinned aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  This client has never been paid to this {crypto ? "wallet" : "account"} before. Confirm it with them if anything feels off.
                </p>
              )}
              <dl className="mt-3 space-y-2">
                {isCrypto(w.destination) ? (
                  <>
                    <PayField label="Currency" value={w.destination.currency ?? "Not given"} copy={false} />
                    <PayField label="Network" value={w.destination.network} />
                    <PayField label="Wallet address" value={w.destination.walletAddress} mono wrap />
                  </>
                ) : (
                  <>
                    <PayField label="Bank" value={w.destination.bankName} />
                    <PayField label="Account name" value={w.destination.accountName} />
                    <PayField label="Account number" value={w.destination.accountNumber} mono />
                    {w.destination.routingNumber && <PayField label="Routing number" value={w.destination.routingNumber} mono />}
                    {w.destination.swiftCode && <PayField label="SWIFT / BIC" value={w.destination.swiftCode} mono />}
                  </>
                )}
                <PayField label={pending ? "Amount to send" : "Amount sent"} value={w.amount} display={formatMoney(w.amount)} />
              </dl>
            </section>

            {/* Client */}
            <section className="rounded-2xl bg-white p-3.5 ring-1 ring-secondary-200">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 ring-1 ring-primary-100">
                  {initials(w.user.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{w.user.fullName}</p>
                  <p className="truncate text-xs text-secondary-500">
                    {w.user.email} · <span className="font-mono font-semibold">{w.user.uid}</span>
                  </p>
                </div>
                <Link
                  href={`/admin/users/${w.user.uid}`}
                  className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50", focusRing)}
                >
                  Open client
                </Link>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-secondary-50 p-2.5 ring-1 ring-secondary-200">
                  <dt className="text-secondary-500">Paid out before</dt>
                  <dd className="mt-0.5 text-sm font-semibold">
                    {w.signals.previousPayouts === 0 ? "Never" : plural(w.signals.previousPayouts, "time")}
                  </dd>
                </div>
                <div className={cn("rounded-xl p-2.5 ring-1", w.signals.exceedsDeposits ? "bg-amber-50 ring-amber-200" : "bg-secondary-50 ring-secondary-200")}>
                  <dt className={w.signals.exceedsDeposits ? "text-amber-800" : "text-secondary-500"}>Deposited in total</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums">{formatMoney(w.signals.deposited)}</dd>
                </div>
              </dl>
              {pending && w.signals.exceedsDeposits && (
                <p className="mt-2 text-[11px] leading-relaxed text-secondary-600">
                  This is more than they have deposited, so part of it is earnings. That is normal for plan returns; check the client&apos;s page if it looks unexpected.
                </p>
              )}
            </section>

            {!pending && (
              <section className="rounded-2xl bg-white p-4 ring-1 ring-secondary-200">
                <h3 className="text-sm font-semibold">Decision</h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-secondary-500">Outcome</dt>
                    <dd>
                      <StatusBadge status={w.status} className="px-2 py-0.5 text-[11px]" />
                    </dd>
                  </div>
                  {w.reviewedBy && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-secondary-500">By</dt>
                      <dd className="font-semibold">{w.reviewedBy}</dd>
                    </div>
                  )}
                  {w.reviewedAt && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-secondary-500">When</dt>
                      <dd className="font-semibold">{formatDateTime(w.reviewedAt)}</dd>
                    </div>
                  )}
                  {w.payoutReference && (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="shrink-0 text-secondary-500">Payout reference</dt>
                      <dd className="flex min-w-0 items-center gap-1 font-mono text-[13px] font-semibold">
                        <span className="truncate">{w.payoutReference}</span>
                        <CopyButton value={w.payoutReference} label="Copy payout reference" className="p-1" />
                      </dd>
                    </div>
                  )}
                </dl>
                {w.reviewNote && (
                  <p className="mt-3 rounded-xl bg-secondary-50 p-3 text-sm text-secondary-700 ring-1 ring-secondary-200">{w.reviewNote}</p>
                )}
              </section>
            )}

            {pending && (
              <section className="rounded-2xl bg-white p-4 ring-1 ring-secondary-200">
                <h3 className="text-sm font-semibold">Your decision</h3>
                <div role="radiogroup" aria-label="Decision" className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-secondary-100 p-1">
                  {(["approve", "reject"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={decision === value}
                      onClick={() => setDecision(value)}
                      disabled={busy}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors",
                        focusRing,
                        decision === value
                          ? value === "approve"
                            ? "bg-white text-emerald-700 shadow-sm"
                            : "bg-white text-red-600 shadow-sm"
                          : "text-secondary-600 hover:text-secondary-900"
                      )}
                    >
                      {value === "approve" ? <CheckCircle2 aria-hidden className="size-4" /> : <XCircle aria-hidden className="size-4" />}
                      {value === "approve" ? "Mark as paid" : "Reject"}
                    </button>
                  ))}
                </div>

                {decision === "approve" ? (
                  <div className="mt-4 space-y-3">
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-secondary-50 p-3.5 ring-1 ring-secondary-200 has-[:checked]:bg-emerald-50 has-[:checked]:ring-emerald-200">
                      <input
                        type="checkbox"
                        checked={sent}
                        disabled={busy}
                        onChange={(event) => setSent(event.target.checked)}
                        className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-emerald-600"
                      />
                      <span className="text-sm text-secondary-800">
                        I have sent <span className="font-semibold">{formatMoney(w.amount)}</span> to this {crypto ? "wallet" : "account"}
                        <span className="mt-0.5 block text-xs text-secondary-500">
                          Marking it paid settles {formatMoney(w.total)} from their balance and emails them. It cannot be undone here.
                        </span>
                      </span>
                    </label>
                    <div>
                      <label htmlFor="payout-reference" className="mb-1.5 block text-sm font-medium text-secondary-700">
                        {crypto ? "Transaction hash" : "Transfer reference"}{" "}
                        <span className="text-xs font-normal text-secondary-400">optional, the client sees it</span>
                      </label>
                      <input
                        id="payout-reference"
                        value={reference}
                        maxLength={200}
                        disabled={busy}
                        onChange={(event) => setReference(event.target.value)}
                        placeholder={crypto ? "0x… or the explorer ID" : "From your bank's confirmation"}
                        className="h-11 w-full rounded-xl border border-secondary-200 bg-white px-3.5 font-mono text-sm outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100"
                      />
                    </div>
                    <NoteField value={note} onChange={setNote} disabled={busy} label="Note" hint="optional, kept with the decision" />
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <p className="rounded-xl bg-secondary-50 p-3 text-xs text-secondary-600 ring-1 ring-secondary-200">
                      {formatMoney(w.total)}, fee included, goes straight back to their available balance.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {REJECT_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          disabled={busy}
                          onClick={() => setNote(reason)}
                          aria-pressed={note === reason}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-left text-xs font-semibold transition-colors",
                            focusRing,
                            note === reason ? "border-red-200 bg-red-50 text-red-700" : "border-secondary-200 bg-white text-secondary-700 hover:border-secondary-300"
                          )}
                        >
                          {reason.split(".")[0]}
                        </button>
                      ))}
                    </div>
                    <NoteField value={note} onChange={setNote} disabled={busy} label="Reason" hint="the client sees this" />
                  </div>
                )}
              </section>
            )}
          </div>

          {pending && (
            <div className="flex gap-2 border-t border-secondary-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Dialog.Close disabled={busy} className={cn("h-12 rounded-xl px-4 text-sm font-semibold text-secondary-700 hover:bg-secondary-100", focusRing)}>
                Cancel
              </Dialog.Close>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !canSubmit}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50",
                  focusRing,
                  decision === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
                )}
              >
                {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {decision === "approve" ? (sent ? "Mark as paid" : "Tick the box once you've sent it") : `Reject and return ${formatMoney(w.total)}`}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** One detail the desk types into their bank or wallet, with its own copy button. */
function PayField({
  label,
  value,
  display,
  mono = false,
  wrap = false,
  copy = true,
}: {
  label: string
  value: string
  display?: string
  mono?: boolean
  wrap?: boolean
  copy?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary-50 px-3 py-2.5 ring-1 ring-secondary-200">
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] text-secondary-500">{label}</dt>
        <dd className={cn("text-sm font-semibold", mono && "font-mono text-[13px]", wrap ? "break-all" : "truncate")}>{display ?? value}</dd>
      </div>
      {copy && <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} className="shrink-0" />}
    </div>
  )
}

function NoteField({
  value,
  onChange,
  disabled,
  label,
  hint,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  label: string
  hint: string
}) {
  return (
    <div>
      <label htmlFor="payout-note" className="mb-1.5 block text-sm font-medium text-secondary-700">
        {label} <span className="text-xs font-normal text-secondary-400">{hint}</span>
      </label>
      <textarea
        id="payout-note"
        rows={3}
        maxLength={500}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 disabled:bg-secondary-50"
      />
    </div>
  )
}
