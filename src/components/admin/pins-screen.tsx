"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Dialog } from "radix-ui"
import { ArrowUpFromLine, ChevronLeft, ChevronRight, Clock, KeyRound, Link2, Loader2, Plus, Search, ShieldCheck, Timer, X } from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { Badge, card, focusRing, PagerButton, plural, Tile } from "@/components/admin/queue-parts"
import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { CopyButton } from "@/components/ui/copy-button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type { AdminPin, AdminUserListItem, IssuedPin, PinStatus } from "@/lib/api/types"
import { formatDateTime, formatMoney, formatRelative } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { countdown, useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

/**
 * Withdrawal PINs. A client needs one to withdraw; each works once.
 *
 * The values are not here and cannot be: the API keeps only a hash, and the
 * plaintext is returned exactly once, to the admin who issued it. This page is
 * for issuing, seeing what is live and what each PIN was spent on, and
 * revoking.
 */

const PAGE_SIZE = 20

const TABS: Array<{ value: PinStatus | ""; label: string }> = [
  { value: "ACTIVE", label: "Live" },
  { value: "USED", label: "Used" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REVOKED", label: "Revoked" },
  { value: "", label: "All" },
]

const VALIDITY = [
  { minutes: 30, label: "30 min" },
  { minutes: 120, label: "2 hours" },
  { minutes: 1440, label: "24 hours" },
  { minutes: 4320, label: "3 days" },
]

export function AdminPinsScreen() {
  const [status, setStatus] = useState<PinStatus | "">("ACTIVE")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)
  const [revoking, setRevoking] = useState<AdminPin | null>(null)
  const [issuing, setIssuing] = useState(false)
  const now = useNow(30_000)

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const summary = useAsyncData(() => api.admin.pinSummary(), `pin-summary:${refreshKey}`)
  const list = useAsyncData(
    () =>
      api.admin.pins({
        page,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
        ...(query ? { search: query } : {}),
      }),
    `admin-pins:${status}:${query}:${page}:${refreshKey}`
  )

  const rows = list.data?.items ?? []
  const meta = list.data?.meta
  const s = summary.data
  const summaryLoading = summary.loading && !s
  const usage = s && s.issued30d > 0 ? Math.round((s.used30d / s.issued30d) * 100) : null

  function refresh() {
    setRefreshKey((key) => key + 1)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Withdrawal <span className="inline-block font-serif font-normal text-primary-600 italic">PINs.</span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">Each PIN works once, for one client. Issuing a new one replaces their current PIN.</p>
        </div>
        <button
          type="button"
          onClick={() => setIssuing(true)}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-800",
            focusRing
          )}
        >
          <Plus aria-hidden className="size-4" />
          Issue PIN
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile
          icon={KeyRound}
          label="Live PINs"
          value={s ? String(s.active) : undefined}
          sub={s ? (s.expiringSoon > 0 ? `${s.expiringSoon} lapse within the hour` : "None about to lapse") : undefined}
          tone={s && s.expiringSoon > 0 ? "warn" : "plain"}
          loading={summaryLoading}
        />
        <Tile
          icon={Link2}
          label="Links not opened"
          value={s ? String(s.linksWaiting) : undefined}
          sub="One-time links still waiting"
          loading={summaryLoading}
        />
        <Tile
          icon={Clock}
          label="Issued today"
          value={s ? String(s.issuedToday) : undefined}
          sub={s ? `${plural(s.issued30d, "PIN")} in 30 days` : undefined}
          loading={summaryLoading}
        />
        <Tile
          icon={ShieldCheck}
          label="Used, 30 days"
          value={s ? String(s.used30d) : undefined}
          sub={usage === null ? "None issued yet" : `${usage}% of issued PINs`}
          tone="good"
          loading={summaryLoading}
        />
      </dl>

      <section className={cn(card, "overflow-hidden")}>
        <div className="border-b border-secondary-200 px-3 pt-3 sm:px-5">
          <div role="tablist" aria-label="Status" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {TABS.map((tab) => {
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
                  {tab.value === "ACTIVE" && s && s.active > 0 && (
                    <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[11px] text-secondary-700 tabular-nums">{s.active}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="border-b border-secondary-200 px-4 py-3.5 sm:px-5">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-400" />
            <label htmlFor="pin-search" className="sr-only">
              Search PINs by client
            </label>
            <input
              id="pin-search"
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
        </div>

        {list.error && !list.data ? (
          <div className="p-5">
            <ErrorState title="Could not load PINs" onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary-600 ring-1 ring-primary-100">
              <KeyRound aria-hidden className="size-6" />
            </span>
            <p className="mt-4 font-semibold">{query ? "No PINs match" : status === "ACTIVE" ? "No live PINs" : "Nothing here"}</p>
            <p className="mt-1 max-w-sm text-sm text-secondary-600">
              {query ? "Try another name or account ID." : "Issue a PIN when a client asks to withdraw."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-secondary-100">
            {rows.map((pin) => (
              <PinRow key={pin.id} pin={pin} now={now} onRevoke={() => setRevoking(pin)} />
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

      <RevokeDialog
        key={revoking?.id ?? "none"}
        pin={revoking}
        onClose={() => setRevoking(null)}
        onRevoked={() => {
          setRevoking(null)
          refresh()
        }}
      />
      {issuing && (
        <IssueSheet
          onClose={() => {
            setIssuing(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------- list */

const SHARE_LABEL = {
  waiting: "Link not opened",
  opened: "Link opened",
  lapsed: "Link unused",
} as const

function PinRow({ pin, now, onRevoke }: { pin: AdminPin; now: number; onRevoke: () => void }) {
  const live = pin.status === "ACTIVE"
  const left = live ? countdown(pin.expiresAt, now) : null
  const soon = live && new Date(pin.expiresAt).getTime() - now < 60 * 60 * 1000

  return (
    <li className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-2xl ring-1",
          live ? "bg-primary-50 text-primary-700 ring-primary-100" : "bg-secondary-50 text-secondary-400 ring-secondary-200"
        )}
      >
        <KeyRound aria-hidden className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {pin.user ? (
            <Link href={`/admin/users/${pin.user.uid}`} className={cn("truncate text-sm font-semibold hover:underline", focusRing)}>
              {pin.user.fullName}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-secondary-500">Deleted client</span>
          )}
          {pin.user && <span className="hidden font-mono text-[11px] font-semibold text-secondary-400 sm:inline">{pin.user.uid}</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-secondary-500">
          Issued {formatRelative(pin.createdAt)}
          {pin.issuedBy ? ` by ${pin.issuedBy}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {live && (
            <Badge tone={soon ? "warn" : "info"}>
              <Timer aria-hidden className="size-3" /> {left ? `${left} left` : "Lapsing"}
            </Badge>
          )}
          {pin.withdrawal && (
            <Badge tone="info">
              <ArrowUpFromLine aria-hidden className="size-3" /> Used for {formatMoney(pin.withdrawal.amount)}
              <span className="font-normal opacity-80">· {pin.withdrawal.status.toLowerCase()}</span>
            </Badge>
          )}
          {pin.status === "USED" && !pin.withdrawal && pin.usedAt && <span className="text-[11px] text-secondary-500">Used {formatDateTime(pin.usedAt)}</span>}
          {pin.share !== "none" && (
            <Badge tone={pin.share === "waiting" ? "warn" : "info"}>
              <Link2 aria-hidden className="size-3" /> {SHARE_LABEL[pin.share]}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <StatusBadge status={pin.status} className="px-2 py-0.5 text-[11px]" />
        {live && (
          <button type="button" onClick={onRevoke} className={cn("rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50", focusRing)}>
            Revoke
          </button>
        )}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ revoke */

function RevokeDialog({ pin, onClose, onRevoked }: { pin: AdminPin | null; onClose: () => void; onRevoked: () => void }) {
  const toast = useToast()
  const [notify, setNotify] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!pin) return null

  async function revoke() {
    if (!pin) return
    setBusy(true)
    try {
      await api.admin.revokePin(pin.id, notify)
      toast.success("PIN revoked", "It can no longer authorise a withdrawal.")
      onRevoked()
    } catch (cause) {
      toast.fromError(cause, "Could not revoke that PIN.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#092739]/45 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            theme.bowline,
            "fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] bg-white p-6 text-secondary-900 shadow-2xl outline-none"
          )}
        >
          <Dialog.Title className="text-lg font-semibold">Revoke this PIN?</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-sm text-secondary-600">
            {pin.user ? `${pin.user.fullName} won't be able to use it, and will need a new one to withdraw.` : "It stops working immediately."}
          </Dialog.Description>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-secondary-50 p-3.5 ring-1 ring-secondary-200 has-[:checked]:bg-primary-50/60 has-[:checked]:ring-primary-200">
            <input
              type="checkbox"
              checked={notify}
              disabled={busy}
              onChange={(event) => setNotify(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
            />
            <span className="text-sm text-secondary-700">
              Email the client
              <span className="mt-0.5 block text-xs text-secondary-500">Leave off if they were never told about this PIN.</span>
            </span>
          </label>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className={cn("h-11 flex-1 rounded-xl border border-secondary-200 text-sm font-semibold text-secondary-700 hover:bg-secondary-50", focusRing)}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => void revoke()}
              disabled={busy}
              className={cn(
                "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60",
                focusRing
              )}
            >
              {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
              Revoke PIN
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ------------------------------------------------------------------- issue */

const optionClass =
  "flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3.5 ring-1 ring-secondary-200 has-[:checked]:bg-primary-50/60 has-[:checked]:ring-primary-200"

function IssueSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [client, setClient] = useState<AdminUserListItem | null>(null)
  const [length, setLength] = useState<4 | 6>(6)
  const [ttl, setTtl] = useState(1440)
  const [notify, setNotify] = useState(false)
  const [share, setShare] = useState(true)
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<IssuedPin | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const matches = useAsyncData(
    () => (query.length >= 2 ? api.admin.users({ search: query, role: "USER", limit: 6 }) : Promise.resolve(null)),
    `pin-client-search:${query}`
  )
  const current = useAsyncData(
    () => (client ? api.admin.pins({ uid: client.uid, status: "ACTIVE", limit: 1 }) : Promise.resolve(null)),
    `pin-client-current:${client?.uid ?? ""}`
  )
  const replacing = current.data?.items[0] ?? null

  async function issue() {
    if (!client) return
    setBusy(true)
    try {
      setIssued(await api.admin.issuePin(client.uid, { length, ttlMinutes: ttl, notifyUser: notify, shareLink: share }))
    } catch (cause) {
      toast.fromError(cause, "Could not issue a PIN.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#092739]/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          // Closing by accident would lose a PIN that can never be shown again.
          onInteractOutside={(event) => issued && event.preventDefault()}
          className={cn(
            theme.bowline,
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-secondary-50 text-secondary-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-secondary-200 bg-white px-5 py-4">
            <Dialog.Title className="text-base font-semibold">{issued ? "PIN issued" : "Issue a withdrawal PIN"}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              disabled={busy}
              className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-secondary-500 hover:bg-secondary-100", focusRing)}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          {issued ? (
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <section className="relative isolate overflow-hidden rounded-[1.25rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-6 text-center text-white">
                <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 -z-10 size-44 rounded-full bg-sky-400/20 blur-3xl" />
                <p className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">For {issued.user.fullName}</p>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <span className="font-mono text-4xl font-bold tracking-[0.3em] tabular-nums">{issued.pin}</span>
                  <CopyButton value={issued.pin} label="Copy PIN" className="text-white hover:bg-white/10" />
                </div>
                <p className="mt-3 text-xs text-sky-100">Expires {formatDateTime(issued.expiresAt)}</p>
              </section>
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                This is the only time the PIN is shown. Copy it or the link before closing.
              </p>
              {issued.shareUrl && (
                <section className={cn(card, "p-4")}>
                  <p className="text-sm font-semibold">One-time link</p>
                  <p className="mt-0.5 text-xs text-secondary-500">Send this instead of the PIN. It reveals the PIN once, then stops working.</p>
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-secondary-50 p-2.5 ring-1 ring-secondary-200">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{issued.shareUrl}</span>
                    <CopyButton value={issued.shareUrl} label="Copy the PIN link" />
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <section>
                <p className="text-sm font-semibold">Client</p>
                {client ? (
                  <div className={cn(card, "mt-2 flex items-center justify-between gap-3 rounded-xl p-3.5")}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{client.fullName}</p>
                      <p className="truncate text-xs text-secondary-500">
                        {client.email} · <span className="font-mono">{client.uid}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClient(null)}
                      className={cn("shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50", focusRing)}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative mt-2">
                      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-400" />
                      <label htmlFor="pin-client" className="sr-only">
                        Find a client
                      </label>
                      <input
                        id="pin-client"
                        type="search"
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Name, email or account ID"
                        className="h-11 w-full rounded-xl border border-secondary-200 bg-white pr-3 pl-10 text-sm outline-none placeholder:text-secondary-400 focus-visible:border-primary-400 focus-visible:ring-4 focus-visible:ring-primary-100"
                      />
                    </div>
                    {query.length >= 2 && (
                      <ul className={cn(card, "mt-2 divide-y divide-secondary-100 overflow-hidden rounded-xl")}>
                        {matches.loading && !matches.data ? (
                          <li className="p-3.5">
                            <Skeleton className="h-5 w-40" />
                          </li>
                        ) : (matches.data?.items ?? []).length === 0 ? (
                          <li className="p-3.5 text-sm text-secondary-500">No client matches.</li>
                        ) : (
                          matches.data?.items.map((user) => (
                            <li key={user.id}>
                              <button
                                type="button"
                                onClick={() => setClient(user)}
                                className="flex w-full items-center justify-between gap-3 p-3.5 text-left hover:bg-primary-50/50 focus-visible:bg-primary-50/60 focus-visible:outline-none"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold">{user.fullName}</span>
                                  <span className="block truncate text-xs text-secondary-500">{user.email}</span>
                                </span>
                                <span className="shrink-0 font-mono text-[11px] text-secondary-400">{user.uid}</span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </>
                )}
                {replacing && (
                  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    They already have a live PIN, issued {formatRelative(replacing.createdAt)}. Issuing a new one revokes it.
                  </p>
                )}
              </section>

              <fieldset>
                <legend className="text-sm font-semibold">Length</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {([4, 6] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLength(value)}
                      aria-pressed={length === value}
                      className={cn(
                        "h-11 rounded-xl text-sm font-semibold",
                        focusRing,
                        length === value ? "bg-primary-700 text-white" : "border border-secondary-200 bg-white text-secondary-700 hover:border-primary-300"
                      )}
                    >
                      {value} digits
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-semibold">Valid for</legend>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {VALIDITY.map((option) => (
                    <button
                      key={option.minutes}
                      type="button"
                      onClick={() => setTtl(option.minutes)}
                      aria-pressed={ttl === option.minutes}
                      className={cn(
                        "h-11 rounded-xl text-xs font-semibold sm:text-sm",
                        focusRing,
                        ttl === option.minutes
                          ? "bg-primary-700 text-white"
                          : "border border-secondary-200 bg-white text-secondary-700 hover:border-primary-300"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">Delivery</legend>
                <label className={optionClass}>
                  <input
                    type="checkbox"
                    checked={share}
                    onChange={(event) => setShare(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
                  />
                  <span className="text-sm text-secondary-700">
                    Create a one-time link
                    <span className="mt-0.5 block text-xs text-secondary-500">Safer than pasting the PIN into a chat: it reveals the PIN once, then dies.</span>
                  </span>
                </label>
                <label className={optionClass}>
                  <input
                    type="checkbox"
                    checked={notify}
                    onChange={(event) => setNotify(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
                  />
                  <span className="text-sm text-secondary-700">
                    Email the PIN to the client
                    <span className="mt-0.5 block text-xs text-secondary-500">Anyone with access to their inbox gets it too. Prefer a channel you trust.</span>
                  </span>
                </label>
              </fieldset>
            </div>
          )}

          <div className="border-t border-secondary-200 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {issued ? (
              <button
                type="button"
                onClick={onClose}
                className={cn("h-11 w-full rounded-xl bg-primary-700 text-sm font-semibold text-white hover:bg-primary-800", focusRing)}
              >
                Done, I&apos;ve copied it
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void issue()}
                disabled={!client || busy}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-700 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50",
                  focusRing
                )}
              >
                {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
                {client ? `Issue PIN for ${client.fullName.split(" ")[0]}` : "Choose a client"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
