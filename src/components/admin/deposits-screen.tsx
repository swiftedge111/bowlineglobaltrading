"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Dialog } from "radix-ui"
import {
  AlertTriangle,
  ArrowDownToLine,
  Bitcoin,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  ImageOff,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Wallet,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { CopyButton } from "@/components/ui/copy-button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { notifyQueuesChanged } from "@/lib/admin-events"
import * as api from "@/lib/api/endpoints"
import type { AdminDepositRow, DepositMethod, RequestStatus } from "@/lib/api/types"
import { formatDateTime, formatMoney, formatRelative, initials } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

/**
 * The deposit queue. A client says they have paid; the desk checks the money
 * is really in the account, then credits it or says why not.
 *
 * Pending requests list oldest first, so whoever has waited longest is seen
 * first. Each opens a review sheet with the proof, the client's history and
 * the decision, including crediting what actually arrived when a bank or
 * network fee took a cut on the way.
 */

const PAGE_SIZE = 20

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing = "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

/** A request waiting longer than this gets flagged in the list. */
const SLOW_MS = 24 * 60 * 60 * 1000

const STATUS_TABS: Array<{ value: RequestStatus | ""; label: string }> = [
  { value: "PENDING", label: "Waiting" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "", label: "All" },
]

const METHOD: Record<DepositMethod, { label: string; icon: LucideIcon }> = {
  BANK_TRANSFER: { label: "Bank transfer", icon: Landmark },
  CRYPTO: { label: "Crypto", icon: Bitcoin },
  DIGITAL_WALLET: { label: "Digital wallet", icon: Wallet },
  CARD: { label: "Card", icon: CreditCard },
}

const METHOD_OPTIONS: Array<{ value: DepositMethod | ""; label: string }> = [
  { value: "", label: "All methods" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CRYPTO", label: "Crypto" },
  { value: "DIGITAL_WALLET", label: "Digital wallet" },
  { value: "CARD", label: "Card" },
]

export function AdminDepositsScreen() {
  const [status, setStatus] = useState<RequestStatus | "">("PENDING")
  const [method, setMethod] = useState<DepositMethod | "">("")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<AdminDepositRow | null>(null)
  const now = useNow(60_000)

  // One request when typing stops, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const summary = useAsyncData(() => api.admin.depositSummary(), `deposit-summary:${refreshKey}`)
  const list = useAsyncData(
    () =>
      api.admin.deposits({
        page,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(method ? { method } : {}),
        ...(query ? { search: query } : {}),
      }),
    `admin-deposits:${status}:${method}:${query}:${page}:${refreshKey}`
  )

  const rows = list.data?.items ?? []
  const meta = list.data?.meta
  const s = summary.data
  const summaryLoading = summary.loading && !s

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
            Deposit{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">requests.</span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            Check the money is in the account before you credit it.
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
          label="Waiting"
          value={s ? String(s.pending.count) : undefined}
          sub={
            s
              ? s.pending.count > 0
                ? `${formatMoney(s.pending.amount)} · oldest ${waited(s.pending.oldestAt, now)}`
                : "Queue is clear"
              : undefined
          }
          tone={s && s.pending.count > 0 ? "warn" : "plain"}
          loading={summaryLoading}
        />
        <Tile
          icon={CheckCircle2}
          label="Approved today"
          value={s ? formatMoney(s.approvedToday.amount) : undefined}
          sub={s ? plural(s.approvedToday.count, "deposit") : undefined}
          tone="good"
          loading={summaryLoading}
        />
        <Tile
          icon={ArrowDownToLine}
          label="Last 30 days"
          value={s ? formatMoney(s.approved30d.amount) : undefined}
          sub={s ? `${plural(s.approved30d.count, "deposit")} approved` : undefined}
          loading={summaryLoading}
        />
        <Tile
          icon={XCircle}
          label="Rejected, 30 days"
          value={s ? String(s.rejected30d) : undefined}
          sub="Payment not found or unclear"
          loading={summaryLoading}
        />
      </dl>

      <section className={cn(card, "overflow-hidden")}>
        {/* Status */}
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

        {/* Search and method */}
        <div className="flex flex-col gap-3 border-b border-secondary-200 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-400" />
            <label htmlFor="deposit-search" className="sr-only">
              Search deposits
            </label>
            <input
              id="deposit-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Client, email, account ID or reference"
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
            <span className="sr-only">Payment method</span>
            <select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value as DepositMethod | "")
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

        {/* Requests */}
        {list.error && !list.data ? (
          <div className="p-5">
            <ErrorState title="Could not load deposits" onRetry={list.reload} />
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
              {status === "PENDING" && !query && !method ? (
                <CheckCircle2 aria-hidden className="size-6" />
              ) : (
                <ArrowDownToLine aria-hidden className="size-6" />
              )}
            </span>
            <p className="mt-4 font-semibold">
              {status === "PENDING" && !query && !method ? "Nothing waiting" : "No deposits match"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-secondary-600">
              {status === "PENDING" && !query && !method
                ? "New requests land here the moment a client submits one."
                : "Try another status, method or search."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-secondary-100">
            {rows.map((row) => (
              <DepositRow key={row.id} row={row} now={now} onOpen={() => setSelected(row)} />
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

      <ReviewSheet
        // Remount per request so the form never carries one client's figures
        // into the next.
        key={selected?.id ?? "none"}
        deposit={selected}
        onClose={() => setSelected(null)}
        onDecided={decided}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- list */

function DepositRow({ row, now, onOpen }: { row: AdminDepositRow; now: number; onOpen: () => void }) {
  const pending = row.status === "PENDING"
  const slow = pending && now - new Date(row.createdAt).getTime() > SLOW_MS
  const firstDeposit = pending && row.userApprovedDeposits === 0
  const Method = METHOD[row.method].icon

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
          <span className="mt-0.5 block truncate text-xs text-secondary-500">
            {METHOD[row.method].label}
            {row.reference ? ` · ${row.reference}` : ""}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {firstDeposit && (
              <Badge tone="info">
                <Sparkles aria-hidden className="size-3" /> First deposit
              </Badge>
            )}
            {pending && !row.hasProof && <Badge tone="warn">No proof</Badge>}
            {slow && (
              <Badge tone="warn">
                <AlertTriangle aria-hidden className="size-3" /> Waiting {waited(row.createdAt, now)}
              </Badge>
            )}
            {!pending && row.reviewedBy && (
              <span className="text-[11px] text-secondary-500">
                {row.status === "APPROVED" ? "Approved" : row.status === "REJECTED" ? "Rejected" : "Closed"} by {row.reviewedBy}
                {row.reviewedAt ? ` · ${formatRelative(row.reviewedAt)}` : ""}
              </span>
            )}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-base font-semibold tabular-nums sm:text-lg">{formatMoney(row.amount)}</span>
          {pending ? (
            <span className="text-[11px] text-secondary-500">{formatRelative(row.createdAt)}</span>
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
          {pending ? "Review" : "Details"}
          <ChevronRight aria-hidden className="size-3.5" />
        </span>
      </button>
    </li>
  )
}

/* ------------------------------------------------------------ review sheet */

const REJECT_REASONS = [
  "We have not received this payment.",
  "The amount received does not match the request.",
  "The proof of payment is missing or unreadable.",
  "This looks like a duplicate of another request.",
]

function ReviewSheet({
  deposit,
  onClose,
  onDecided,
}: {
  deposit: AdminDepositRow | null
  onClose: () => void
  onDecided: () => void
}) {
  const toast = useToast()
  const [decision, setDecision] = useState<"approve" | "reject">("approve")
  const [received, setReceived] = useState(deposit?.amount ?? "")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const open = deposit !== null
  const pending = deposit?.status === "PENDING"

  const proof = useAsyncData(
    () => (deposit?.hasProof ? api.admin.depositProof(deposit.id) : Promise.resolve({ url: null })),
    `deposit-proof:${deposit?.id ?? "none"}`
  )

  if (!deposit) {
    return <Dialog.Root open={false} />
  }

  const requestedCents = Math.round(Number(deposit.amount) * 100)
  const receivedNumber = Number(received)
  const receivedValid = received.trim() !== "" && Number.isFinite(receivedNumber) && receivedNumber > 0 && /^\d+(\.\d{1,2})?$/.test(received.trim())
  const receivedCents = receivedValid ? Math.round(receivedNumber * 100) : requestedCents
  const adjusted = decision === "approve" && receivedValid && receivedCents !== requestedCents
  const canSubmit = decision === "approve" ? receivedValid : note.trim().length > 0

  async function submit() {
    if (!deposit || !canSubmit) return
    setBusy(true)
    try {
      await api.admin.processDeposit(deposit.id, {
        action: decision,
        note: note.trim() || undefined,
        ...(adjusted ? { receivedAmount: receivedCents / 100 } : {}),
      })
      toast.success(
        decision === "approve" ? "Deposit approved" : "Deposit rejected",
        decision === "approve"
          ? `${formatMoney((receivedCents / 100).toFixed(2))} credited to ${deposit.user.fullName}.`
          : "They can see your reason on their request."
      )
      onDecided()
    } catch (cause) {
      toast.fromError(cause, "Could not process that deposit.")
    } finally {
      setBusy(false)
    }
  }

  const Method = METHOD[deposit.method].icon

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !busy && onClose()}>
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
              <Dialog.Title className="truncate text-base font-semibold">
                {pending ? "Review deposit" : "Deposit details"}
              </Dialog.Title>
              <p className="text-xs text-secondary-500">Submitted {formatDateTime(deposit.createdAt)}</p>
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
                  <p className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">Client says they sent</p>
                  <p className="mt-1 font-heading text-4xl font-medium tracking-tight tabular-nums">{formatMoney(deposit.amount)}</p>
                </div>
                <StatusBadge status={deposit.status} />
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-white/15 pt-3 text-sm">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <dt className="text-primary-100">Method</dt>
                  <dd className="flex items-center gap-1.5 font-semibold">
                    <Method aria-hidden className="size-4" /> {METHOD[deposit.method].label}
                  </dd>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <dt className="shrink-0 text-primary-100">{deposit.method === "CRYPTO" ? "Transaction hash" : "Reference"}</dt>
                  <dd className="flex min-w-0 items-center gap-1 font-mono text-[13px] font-semibold">
                    {deposit.reference ? (
                      <>
                        <span className="truncate">{deposit.reference}</span>
                        <CopyButton value={deposit.reference} label="Copy reference" className="p-1 text-primary-100 hover:bg-white/10 hover:text-white" />
                      </>
                    ) : (
                      <span className="font-sans font-normal text-primary-100">None given</span>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Client */}
            <section className="flex items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-secondary-200">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-50 text-xs font-bold text-primary-700 ring-1 ring-primary-100">
                {initials(deposit.user.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{deposit.user.fullName}</p>
                <p className="truncate text-xs text-secondary-500">
                  {deposit.user.email} · <span className="font-mono font-semibold">{deposit.user.uid}</span>
                </p>
                <p className="mt-1 text-[11px] text-secondary-600">
                  {pending && deposit.userApprovedDeposits === 0 ? (
                    <span className="font-semibold text-primary-700">First deposit from this client</span>
                  ) : (
                    `${plural(deposit.userApprovedDeposits, "approved deposit")} so far`
                  )}
                </p>
              </div>
              <Link
                href={`/admin/users/${deposit.user.uid}`}
                className={cn("shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-50", focusRing)}
              >
                Open client
              </Link>
            </section>

            {/* Proof */}
            <section className="rounded-2xl bg-white p-4 ring-1 ring-secondary-200">
              <h3 className="text-sm font-semibold">Proof of payment</h3>
              {!deposit.hasProof ? (
                <p className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                  <ImageOff aria-hidden className="size-4 shrink-0 text-amber-600" />
                  No file was uploaded. Match the reference against your statement instead.
                </p>
              ) : proof.loading && !proof.data ? (
                <Skeleton className="mt-3 h-40 w-full rounded-xl" />
              ) : !proof.data?.url ? (
                <p className="mt-2 text-xs text-red-600">
                  The file could not be opened.{" "}
                  <button type="button" onClick={proof.reload} className="font-semibold underline underline-offset-2">
                    Try again
                  </button>
                </p>
              ) : deposit.proofKind === "image" ? (
                <a href={proof.data.url} target="_blank" rel="noreferrer" className={cn("mt-3 block overflow-hidden rounded-xl ring-1 ring-secondary-200", focusRing)}>
                  {/* A short-lived signed URL from private storage; next/image would try to cache it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proof.data.url} alt={`Proof of payment from ${deposit.user.fullName}`} className="max-h-80 w-full bg-secondary-100 object-contain" />
                  <span className="flex items-center justify-center gap-1.5 bg-secondary-50 py-2 text-xs font-semibold text-primary-700">
                    Open full size <ExternalLink aria-hidden className="size-3.5" />
                  </span>
                </a>
              ) : (
                <a
                  href={proof.data.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("mt-3 flex items-center gap-3 rounded-xl bg-secondary-50 p-3 ring-1 ring-secondary-200 hover:ring-primary-300", focusRing)}
                >
                  <FileText aria-hidden className="size-6 text-primary-700" />
                  <span className="flex-1 text-sm font-semibold">{deposit.proofKind === "pdf" ? "Open the PDF" : "Open the file"}</span>
                  <ExternalLink aria-hidden className="size-4 text-secondary-400" />
                </a>
              )}
              {deposit.hasProof && <p className="mt-2 text-[11px] text-secondary-500">Links expire after five minutes; reopen the request for a fresh one.</p>}
            </section>

            {/* Decision already made */}
            {!pending && (
              <section className="rounded-2xl bg-white p-4 ring-1 ring-secondary-200">
                <h3 className="text-sm font-semibold">Decision</h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-secondary-500">Outcome</dt>
                    <dd>
                      <StatusBadge status={deposit.status} className="px-2 py-0.5 text-[11px]" />
                    </dd>
                  </div>
                  {deposit.reviewedBy && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-secondary-500">By</dt>
                      <dd className="font-semibold">{deposit.reviewedBy}</dd>
                    </div>
                  )}
                  {deposit.reviewedAt && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-secondary-500">When</dt>
                      <dd className="font-semibold">{formatDateTime(deposit.reviewedAt)}</dd>
                    </div>
                  )}
                </dl>
                {deposit.reviewNote && (
                  <p className="mt-3 rounded-xl bg-secondary-50 p-3 text-sm text-secondary-700 ring-1 ring-secondary-200">
                    {deposit.reviewNote}
                  </p>
                )}
              </section>
            )}

            {/* Decide */}
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
                      {value === "approve" ? "Approve" : "Reject"}
                    </button>
                  ))}
                </div>

                {decision === "approve" ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label htmlFor="received-amount" className="mb-1.5 block text-sm font-medium text-secondary-700">
                        Amount received (USD)
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-secondary-400">$</span>
                        <input
                          id="received-amount"
                          inputMode="decimal"
                          value={received}
                          disabled={busy}
                          onChange={(event) => setReceived(event.target.value.replace(/[^\d.]/g, ""))}
                          aria-invalid={!receivedValid}
                          className="h-12 w-full rounded-xl border border-secondary-200 bg-white pr-3 pl-7 text-base font-semibold tabular-nums outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 aria-[invalid=true]:border-red-300"
                        />
                      </div>
                      {!receivedValid ? (
                        <p className="mt-1.5 text-xs text-red-600">Enter an amount above zero, with up to two decimals.</p>
                      ) : adjusted ? (
                        <p className="mt-1.5 flex gap-1.5 text-xs text-amber-800">
                          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                          The client entered {formatMoney(deposit.amount)}. You&apos;ll credit {formatMoney((receivedCents / 100).toFixed(2))} and their
                          request will show that figure. Say why in the note.
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-secondary-500">Change this only if a different amount arrived.</p>
                      )}
                    </div>
                    <NoteField value={note} onChange={setNote} disabled={busy} label="Note" hint="optional, kept with the decision" />
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
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
                          {reason.replace(/\.$/, "")}
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
              <Dialog.Close
                disabled={busy}
                className={cn("h-12 rounded-xl px-4 text-sm font-semibold text-secondary-700 hover:bg-secondary-100", focusRing)}
              >
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
                {decision === "approve"
                  ? `Approve and credit ${formatMoney((receivedCents / 100).toFixed(2))}`
                  : "Reject request"}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
      <label htmlFor="review-note" className="mb-1.5 block text-sm font-medium text-secondary-700">
        {label} <span className="text-xs font-normal text-secondary-400">{hint}</span>
      </label>
      <textarea
        id="review-note"
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

/* ------------------------------------------------------------------- parts */

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  loading,
  tone = "plain",
}: {
  icon: LucideIcon
  label: string
  value: string | undefined
  sub?: string
  loading: boolean
  tone?: "plain" | "good" | "warn"
}) {
  return (
    <div className={cn(card, "min-w-0 p-4 sm:p-5", tone === "warn" && "border-amber-300 bg-amber-50/60")}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg ring-1",
            tone === "good" && "bg-emerald-50 text-emerald-600 ring-emerald-100",
            tone === "warn" && "bg-white text-amber-600 ring-amber-200",
            tone === "plain" && "bg-primary-50 text-primary-700 ring-primary-100"
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <dt className="text-xs leading-tight text-secondary-600 sm:text-sm">{label}</dt>
      </div>
      <dd className="mt-3">
        {loading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <span className="block truncate font-heading text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</span>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-secondary-500 sm:text-xs">{loading ? " " : sub}</span>
      </dd>
    </div>
  )
}

function Badge({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone === "info" ? "border-primary-200 bg-primary-50 text-primary-700" : "border-amber-200 bg-amber-50 text-amber-800"
      )}
    >
      {children}
    </span>
  )
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid size-9 place-items-center rounded-lg border border-secondary-200 text-secondary-600 hover:border-primary-300 hover:text-primary-700 disabled:pointer-events-none disabled:opacity-40",
        focusRing
      )}
    >
      {children}
    </button>
  )
}

function plural(count: number, noun: string) {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`
}

/** "45m", "3h", "2d" since `from`. */
function waited(from: string | null, now: number) {
  if (!from) return "—"
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
