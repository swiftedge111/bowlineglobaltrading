"use client"

import { useId, useState } from "react"
import Link from "next/link"
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  X,
} from "lucide-react"

import {
  Badge,
  card,
  focusRing,
  PagerButton,
  plural,
  Tile,
} from "@/components/admin/queue-parts"
import { ErrorState } from "@/components/app/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type { AuditLogEntry, AuditLogFilters } from "@/lib/api/types"
import { saveCsv, toCsv, today } from "@/lib/csv"
import { formatDateTime, formatRelative, humanise } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

const columns =
  "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)_minmax(0,0.65fr)_2.25rem] md:gap-3"

const headerAction =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-secondary-200 bg-white px-4 text-sm font-semibold text-secondary-800 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-700 disabled:pointer-events-none disabled:opacity-50"

const filterInput =
  "h-11 min-w-0 w-full rounded-xl border border-secondary-200 bg-white px-3.5 text-sm font-semibold text-secondary-700"

export function AdminAuditLogsScreen() {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const [search, setSearch] = useState("")
  const [exporting, setExporting] = useState(false)

  const options = useAsyncData(
    () => api.admin.auditLogFilters(),
    "admin-audit-filters"
  )
  const invalidDates = Boolean(
    filters.from && filters.to && filters.from > filters.to
  )
  const requestKey = JSON.stringify({ ...filters, page })
  const result = useAsyncData(async () => {
    if (invalidDates) return null
    const data = await api.admin.auditLogs({
      ...filters,
      page,
      limit: PAGE_SIZE,
    })
    return { key: requestKey, ...data }
  }, requestKey)

  const data = result.data?.key === requestKey ? result.data : null
  const meta = data?.meta
  const rows = data?.items ?? []
  const isFiltered = Object.values(filters).some(Boolean)
  const loading = !invalidDates && (result.loading || (!data && !result.error))
  const actionOptions = options.data?.actions ?? []
  const actors = options.data?.actors ?? []

  function changeFilter<K extends keyof AuditLogFilters>(
    name: K,
    value: string
  ) {
    if (value === (filters[name] ?? "") && page === 1) return
    setFilters((previous) => ({ ...previous, [name]: value }))
    setPage(1)
    result.reload()
  }

  function goToPage(next: number) {
    setPage(next)
    result.reload()
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const all: AuditLogEntry[] = []
      const limit = 100
      let cursor: string | undefined
      do {
        const batch = await api.admin.auditLogs({
          ...filters,
          ...(cursor ? { cursor } : {}),
          limit,
        })
        all.push(...batch.items)
        cursor =
          batch.items.length === limit ? batch.items.at(-1)?.id : undefined
      } while (cursor)
      const header = [
        "Event ID",
        "Action",
        "Admin",
        "Admin email",
        "Admin ID",
        "Target type",
        "Target ID",
        "Target UID",
        "IP",
        "Time (UTC)",
        "Before",
        "After",
      ]
      const body = all.map((entry) => [
        entry.id,
        entry.action,
        entry.actor?.username ?? "System",
        entry.actor?.email,
        entry.actorId,
        entry.targetType,
        entry.targetId,
        entry.targetUid,
        entry.ip,
        entry.createdAt,
        entry.before == null ? "" : JSON.stringify(entry.before),
        entry.after == null ? "" : JSON.stringify(entry.after),
      ])
      saveCsv(`bowline-audit-log-${today()}.csv`, toCsv(header, body))
      toast.success(
        "Export ready",
        `${plural(all.length, "event")} saved as CSV.`
      )
    } catch (cause) {
      toast.fromError(cause, "Could not export the audit log.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Audit{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              log.
            </span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            See who took each administrative action, when it happened, and what
            changed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={invalidDates}
            onClick={() => {
              options.reload()
              result.reload()
            }}
            className={cn(headerAction, focusRing)}
          >
            <RefreshCw
              aria-hidden
              className={cn("size-4", result.loading && data && "animate-spin")}
            />
            Refresh
          </button>
          <button
            type="button"
            disabled={exporting || invalidDates || loading || !meta?.total}
            onClick={() => void exportCsv()}
            className={cn(headerAction, focusRing)}
          >
            <Download aria-hidden className="size-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4">
        <Tile
          icon={ScrollText}
          label={isFiltered ? "Matching events" : "Recorded events"}
          value={meta?.total.toLocaleString("en-US") ?? "—"}
          loading={loading && !meta}
        />
        <Tile
          icon={ShieldCheck}
          label="Recorded admins"
          sub="Across the audit log"
          value={options.data ? String(actors.length) : "—"}
          loading={options.loading && !options.data}
          tone="good"
        />
      </dl>

      <section
        aria-label="Audit events"
        className={cn(card, "min-w-0 overflow-hidden")}
      >
        <form
          className="space-y-3 border-b border-secondary-200 px-4 py-3.5 sm:px-5"
          onSubmit={(event) => {
            event.preventDefault()
            changeFilter("search", search.trim())
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-400"
              />
              <label htmlFor="audit-search" className="sr-only">
                Search audit log
              </label>
              <input
                id="audit-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="User email, UID or target ID"
                maxLength={254}
                className="h-11 w-full min-w-0 rounded-xl border border-secondary-200 bg-secondary-50/60 pr-10 pl-10 text-sm transition-colors outline-none placeholder:text-secondary-400 focus-visible:border-primary-400 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary-100 [&::-webkit-search-cancel-button]:hidden"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("")
                    changeFilter("search", "")
                  }}
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
            <button type="submit" className={cn(headerAction, focusRing)}>
              Search
            </button>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FilterSelect
              label="Action type"
              value={filters.action ?? ""}
              onChange={(value) => changeFilter("action", value)}
            >
              <option value="">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {actionName(action)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Admin"
              value={filters.actorId ?? ""}
              onChange={(value) => changeFilter("actorId", value)}
            >
              <option value="">All admins</option>
              <option value="system">System</option>
              {actors.map(({ id, username, email }) => (
                <option key={id} value={id}>
                  {username} ({email})
                </option>
              ))}
            </FilterSelect>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-secondary-600">
                From (UTC)
              </span>
              <input
                type="date"
                value={filters.from ?? ""}
                onChange={(event) => changeFilter("from", event.target.value)}
                className={cn(filterInput, focusRing, "block appearance-none")}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs font-semibold text-secondary-600">
                Through (UTC)
              </span>
              <input
                type="date"
                value={filters.to ?? ""}
                onChange={(event) => changeFilter("to", event.target.value)}
                aria-invalid={invalidDates || undefined}
                aria-describedby={invalidDates ? "audit-date-error" : undefined}
                className={cn(
                  filterInput,
                  focusRing,
                  "block appearance-none aria-invalid:border-red-300"
                )}
              />
            </label>
          </div>
          {invalidDates && (
            <p id="audit-date-error" className="text-sm text-red-600">
              End date must be on or after the start date.
            </p>
          )}
          {Boolean(options.error) && (
            <button
              type="button"
              onClick={options.reload}
              className={cn(
                "rounded text-sm font-semibold text-primary-700 underline",
                focusRing
              )}
            >
              Retry loading filter options
            </button>
          )}
        </form>

        {invalidDates ? null : result.error ? (
          <div className="p-5">
            <ErrorState
              title="Could not load audit events"
              onRetry={result.reload}
            />
          </div>
        ) : loading && !data ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length ? (
          <>
            <div
              aria-hidden
              className={cn(
                "hidden border-b border-secondary-200 bg-secondary-50/60 px-5 py-3 text-xs font-semibold text-secondary-500 md:grid",
                columns
              )}
            >
              <span>Action</span>
              <span>Admin</span>
              <span>Target</span>
              <span>When</span>
            </div>
            <ul className="grid min-w-0 grid-cols-1 gap-3 p-3 md:gap-0 md:divide-y md:divide-secondary-100 md:p-0">
              {rows.map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
              <ScrollText aria-hidden className="size-6" />
            </span>
            <p className="mt-4 font-semibold">
              {isFiltered ? "No audit events match" : "Nothing logged yet"}
            </p>
            <p className="mt-1 max-w-sm text-sm text-secondary-600">
              {isFiltered
                ? "Try changing the filters or search."
                : "Administrative actions will be recorded here as they happen."}
            </p>
          </div>
        )}

        {meta && meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-secondary-200 px-5 py-3.5">
            <p className="text-xs text-secondary-500 tabular-nums">
              Showing {(meta.page - 1) * meta.limit + 1}–
              {Math.min(meta.page * meta.limit, meta.total)} of{" "}
              {meta.total.toLocaleString("en-US")}
            </p>
            <div className="flex items-center gap-1.5">
              <PagerButton
                label="Previous page"
                disabled={meta.page <= 1 || loading}
                onClick={() => goToPage(meta.page - 1)}
              >
                <ChevronLeft aria-hidden className="size-4" />
              </PagerButton>
              <span className="min-w-16 text-center text-xs font-semibold text-secondary-700 tabular-nums">
                {meta.page} / {meta.pages}
              </span>
              <PagerButton
                label="Next page"
                disabled={meta.page >= meta.pages || loading}
                onClick={() => goToPage(meta.page + 1)}
              >
                <ChevronRight aria-hidden className="size-4" />
              </PagerButton>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-secondary-600">
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            filterInput,
            focusRing,
            "appearance-none truncate pr-9",
            value && "border-primary-300 text-primary-700"
          )}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-secondary-400"
        />
      </span>
    </label>
  )
}

function actionName(action: string) {
  return humanise(action.replace(/[.-]/g, "_"))
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const action = actionName(entry.action)
  const target = humanise(entry.targetType?.replace(/([a-z])([A-Z])/g, "$1_$2"))
  const exact = formatDateTime(entry.createdAt)

  return (
    <li
      className={cn(
        card,
        "min-w-0 overflow-hidden md:rounded-none md:border-x-0 md:border-t-0 md:border-b-0 md:shadow-none"
      )}
    >
      <div
        className={cn(
          "relative grid min-w-0 grid-cols-1 items-center gap-2 px-4 py-3.5 md:px-5",
          columns
        )}
      >
        <div className="flex min-w-0 items-center gap-3 pr-9 md:pr-0">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
            <ScrollText aria-hidden className="size-4" />
          </span>
          <p className="min-w-0 text-sm font-semibold wrap-anywhere">
            {action}
          </p>
        </div>
        <div className="min-w-0 text-sm">
          <span className="text-xs text-secondary-500 md:sr-only">By </span>
          <span className="font-semibold text-secondary-700 wrap-anywhere">
            {entry.actor?.username ?? "System"}
          </span>
          {entry.actor?.email && (
            <span className="ml-1 text-xs text-secondary-500 wrap-anywhere md:ml-0 md:block">
              {entry.actor.email}
            </span>
          )}
        </div>
        <div className="min-w-0">
          {entry.targetUid ? (
            <Link
              href={`/admin/users/${encodeURIComponent(entry.targetUid)}`}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded text-sm font-semibold text-primary-700 hover:underline",
                focusRing
              )}
            >
              <span className="min-w-0 wrap-anywhere">
                {target} {entry.targetUid}
              </span>
              <ExternalLink aria-hidden className="size-3 shrink-0" />
            </Link>
          ) : (
            <>
              <span className="text-sm text-secondary-700">{target}</span>
              {entry.targetId && (
                <code className="ml-1 font-mono text-xs text-secondary-500 wrap-anywhere md:ml-0 md:block">
                  {entry.targetId}
                </code>
              )}
            </>
          )}
        </div>
        <time
          dateTime={entry.createdAt}
          title={entry.createdAt}
          className="min-w-0 text-xs text-secondary-600 tabular-nums"
        >
          {formatRelative(entry.createdAt)}
        </time>
        <button
          type="button"
          aria-label={`${expanded ? "Hide" : "Show"} details for ${action}`}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className={cn(
            "absolute top-3 right-3 grid size-9 shrink-0 place-items-center rounded-lg text-secondary-600 transition-colors hover:bg-primary-50 hover:text-primary-700 md:static",
            focusRing
          )}
          onClick={() => setExpanded((previous) => !previous)}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>

      <div
        id={detailsId}
        hidden={!expanded}
        className="min-w-0 space-y-3 border-t border-secondary-200 bg-secondary-50/60 px-4 py-4 md:px-5"
      >
        {expanded && (
          <>
            <dl className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-secondary-500">Logged at</dt>
                <dd>
                  <time dateTime={entry.createdAt} title={entry.createdAt}>
                    {exact}
                  </time>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-secondary-500">IP address</dt>
                <dd className="font-mono text-xs wrap-anywhere">
                  {entry.ip ?? "—"}
                </dd>
              </div>
            </dl>
            <AuditChanges before={entry.before} after={entry.after} />
          </>
        )}
      </div>
    </li>
  )
}

function snapshotFields(value: unknown): Record<string, unknown> {
  if (value == null) return {}
  if (typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>
  return { Value: value }
}

function AuditChanges({ before, after }: { before: unknown; after: unknown }) {
  if (before == null && after == null) {
    return (
      <p className="text-sm text-secondary-600">
        No before or after values were recorded.
      </p>
    )
  }

  const previous = snapshotFields(before)
  const next = snapshotFields(after)
  const changes = [...new Set([...Object.keys(previous), ...Object.keys(next)])]
    .map((field) => ({
      field,
      before: Object.hasOwn(previous, field)
        ? JSON.stringify(previous[field], null, 2)
        : undefined,
      after: Object.hasOwn(next, field)
        ? JSON.stringify(next[field], null, 2)
        : undefined,
    }))
    .filter((change) => change.before !== change.after)

  if (!changes.length)
    return (
      <p className="text-sm text-secondary-600">
        No changed values were recorded.
      </p>
    )

  return (
    <div className="min-w-0 space-y-2">
      <h3 className="text-sm font-semibold">Recorded changes</h3>
      <ul className="grid min-w-0 grid-cols-1 gap-2">
        {changes.map((change) => (
          <li
            key={change.field}
            className="min-w-0 space-y-2 rounded-xl border border-secondary-200 bg-white p-3"
          >
            <p className="font-mono text-xs font-semibold wrap-anywhere">
              {change.field}
            </p>
            <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              {(["before", "after"] as const).map((side) => (
                <div
                  key={side}
                  className="min-w-0 rounded-lg bg-secondary-50 p-2.5"
                >
                  <dt>
                    <Badge tone={side === "before" ? "warn" : "info"}>
                      {side === "before" ? "Before" : "After"}
                    </Badge>
                  </dt>
                  <dd className="mt-1.5 min-w-0">
                    <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
                      {change[side] ?? "—"}
                    </pre>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
