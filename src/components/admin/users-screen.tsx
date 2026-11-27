"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MailWarning,
  Search,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react"

import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type { AdminUserListItem, AdminUserSort, Role, UserStatus } from "@/lib/api/types"
import { findCountry } from "@/lib/countries"
import { saveCsv, toCsv, today } from "@/lib/csv"
import { formatDate, formatMoney, formatRelative, initials, isZero } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/**
 * Every account on the platform, clients first.
 *
 * Phones get a card per client: the name, what they hold and whether anything
 * needs a second look. Wider screens get the full table. Either way a row
 * opens the client's page, where the actions live.
 */

const PAGE_SIZE = 20

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing = "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

type TabKey = "clients" | "active" | "suspended" | "admins"

const TABS: Array<{ key: TabKey; label: string; role: Role; status?: UserStatus }> = [
  { key: "clients", label: "All clients", role: "USER" },
  { key: "active", label: "Active", role: "USER", status: "ACTIVE" },
  { key: "suspended", label: "Suspended", role: "USER", status: "SUSPENDED" },
  { key: "admins", label: "Admins", role: "ADMIN" },
]

const SORTS: Array<{ value: AdminUserSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "lastSeen", label: "Recently seen" },
  { value: "name", label: "Name A–Z" },
]

export function AdminUsersScreen() {
  const toast = useToast()
  const [tab, setTab] = useState<TabKey>("clients")
  const [sort, setSort] = useState<AdminUserSort>("newest")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [exporting, setExporting] = useState(false)

  // One request when typing stops, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const active = TABS.find((item) => item.key === tab)!
  const filters = {
    role: active.role,
    sort,
    ...(active.status ? { status: active.status } : {}),
    ...(query ? { search: query } : {}),
  }

  const counts = useAsyncData(() => api.admin.userCounts(), "admin-user-counts")
  const list = useAsyncData(
    () => api.admin.users({ ...filters, page, limit: PAGE_SIZE }),
    `admin-users:${tab}:${sort}:${query}:${page}`
  )

  const rows = list.data?.items ?? []
  const meta = list.data?.meta
  const loading = list.loading && !list.data
  const c = counts.data

  const tabCount: Record<TabKey, number | undefined> = {
    clients: c?.clients,
    active: c?.active,
    suspended: c?.suspended,
    admins: c?.admins,
  }

  function pickTab(key: TabKey) {
    setTab(key)
    setPage(1)
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const all: AdminUserListItem[] = []
      // 100 is the API's page cap; 100 pages covers 10,000 accounts.
      for (let next = 1; next <= 100; next += 1) {
        const result = await api.admin.users({ ...filters, page: next, limit: 100 })
        all.push(...result.items)
        if (next >= result.meta.pages) break
      }
      downloadCsv(all, tab)
      toast.success("Export ready", `${all.length} account${all.length === 1 ? "" : "s"} saved as CSV.`)
    } catch (cause) {
      toast.fromError(cause, "Could not export the list.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Client{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">accounts.</span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            Everyone who has signed up, what they hold, and when they were last here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || (meta?.total ?? 0) === 0}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-xl border border-secondary-200 bg-white px-4 text-sm font-semibold text-secondary-800 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-700 disabled:pointer-events-none disabled:opacity-50",
            focusRing
          )}
        >
          <Download aria-hidden className="size-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {/* At a glance */}
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Tile icon={Users} label="Clients" value={c?.clients} loading={counts.loading && !c} />
        <Tile
          icon={UserPlus}
          label="New this week"
          value={c?.newThisWeek}
          loading={counts.loading && !c}
          tone="good"
        />
        <Tile
          icon={MailWarning}
          label="Email not verified"
          value={c?.unverified}
          loading={counts.loading && !c}
          tone={c && c.unverified > 0 ? "warn" : "plain"}
        />
        <Tile
          icon={UserX}
          label="Suspended"
          value={c?.suspended}
          loading={counts.loading && !c}
          tone={c && c.suspended > 0 ? "bad" : "plain"}
        />
      </dl>

      <section className={cn(card, "overflow-hidden")}>
        {/* Tabs */}
        <div className="border-b border-secondary-200 px-3 pt-3 sm:px-5">
          <div role="tablist" aria-label="Accounts" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {TABS.map((item) => {
              const selected = tab === item.key
              const count = tabCount[item.key]
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => pickTab(item.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                    focusRing,
                    selected
                      ? "border-primary-600 text-primary-700"
                      : "border-transparent text-secondary-500 hover:text-secondary-800"
                  )}
                >
                  {item.label}
                  {count !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                        selected ? "bg-primary-50 text-primary-700" : "bg-secondary-100 text-secondary-600"
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

        {/* Search and sort */}
        <div className="flex flex-col gap-3 border-b border-secondary-200 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-secondary-400" />
            <label htmlFor="user-search" className="sr-only">
              Search accounts
            </label>
            <input
              id="user-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, username or account ID"
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
            <span className="sr-only">Sort by</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as AdminUserSort)
                setPage(1)
              }}
              className={cn(
                "h-11 w-full appearance-none rounded-xl border border-secondary-200 bg-white pr-9 pl-3.5 text-sm font-semibold text-secondary-700 sm:w-auto",
                focusRing
              )}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronRight aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 rotate-90 text-secondary-400" />
          </label>
        </div>

        {/* Rows */}
        {list.error && !list.data ? (
          <div className="p-5">
            <ErrorState title="Could not load accounts" onRetry={list.reload} />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4 sm:p-5">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-secondary-100 text-secondary-500">
              <Users aria-hidden className="size-6" />
            </span>
            <p className="mt-4 font-semibold">{query ? "No accounts match that search" : emptyTitle(tab)}</p>
            <p className="mt-1 max-w-sm text-sm text-secondary-600">
              {query ? "Try part of a name, an email, or the account ID." : "Accounts will show up here as they arrive."}
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-secondary-100 md:hidden">
              {rows.map((row) => (
                <UserCard key={row.id} user={row} />
              ))}
            </ul>
            <UserTable rows={rows} showMoney={tab !== "admins"} />
          </>
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
    </div>
  )
}

function emptyTitle(tab: TabKey) {
  if (tab === "suspended") return "No suspended accounts"
  if (tab === "admins") return "No admins"
  return "No clients yet"
}

/* ------------------------------------------------------------------- parts */

function Tile({
  icon: Icon,
  label,
  value,
  loading,
  tone = "plain",
}: {
  icon: typeof Users
  label: string
  value: number | undefined
  loading: boolean
  tone?: "plain" | "good" | "warn" | "bad"
}) {
  return (
    <div className={cn(card, "flex items-center gap-3 p-3.5 sm:p-5")}>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl ring-1 sm:size-10",
          tone === "good" && "bg-emerald-50 text-emerald-600 ring-emerald-100",
          tone === "warn" && "bg-amber-50 text-amber-600 ring-amber-200",
          tone === "bad" && "bg-red-50 text-red-600 ring-red-100",
          tone === "plain" && "bg-primary-50 text-primary-700 ring-primary-100"
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs leading-tight text-secondary-600 sm:text-sm">{label}</dt>
        <dd className="font-heading text-2xl font-semibold tracking-tight tabular-nums">
          {loading ? <Skeleton className="mt-1 h-7 w-10" /> : (value ?? 0).toLocaleString("en-US")}
        </dd>
      </div>
    </div>
  )
}

function Avatar({ user }: { user: AdminUserListItem }) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold ring-1",
        user.status === "SUSPENDED"
          ? "bg-red-50 text-red-700 ring-red-100"
          : user.role === "ADMIN"
            ? "bg-linear-to-br from-primary-600 to-primary-800 text-white ring-primary-700"
            : "bg-primary-50 text-primary-700 ring-primary-100"
      )}
    >
      {initials(user.fullName)}
    </span>
  )
}

function Country({ code }: { code: string | null }) {
  const country = findCountry(code ?? undefined)
  if (!country) return <span className="text-secondary-400">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={country.name}>
      <span aria-hidden>{country.flag}</span>
      <span className="max-w-32 truncate">{country.name}</span>
    </span>
  )
}

function Flags({ user }: { user: AdminUserListItem }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {user.status === "SUSPENDED" && <StatusBadge status="SUSPENDED" className="px-2 py-0.5 text-[11px]" />}
      {user.role === "ADMIN" && (
        <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
          Admin
        </span>
      )}
      {!user.emailVerified && (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          Unverified
        </span>
      )}
    </span>
  )
}

/** Phones: one tappable card per account. */
function UserCard({ user }: { user: AdminUserListItem }) {
  const reserved = user.balance !== user.available
  return (
    <li>
      <Link
        href={`/admin/users/${user.uid}`}
        className="flex gap-3 px-4 py-4 transition-colors active:bg-secondary-50 focus-visible:bg-primary-50/50 focus-visible:outline-none"
      >
        <Avatar user={user} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.fullName}</p>
              <p className="truncate text-xs text-secondary-500">{user.email}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums">{formatMoney(user.balance)}</p>
              {!isZero(user.inPlans) && (
                <p className="text-[11px] text-secondary-500 tabular-nums">+{formatMoney(user.inPlans)} in plans</p>
              )}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-secondary-500">
            <span className="font-mono font-semibold text-secondary-700">{user.uid}</span>
            <span>{user.lastLoginAt ? `Seen ${formatRelative(user.lastLoginAt)}` : "Never signed in"}</span>
            {reserved && <span className="text-amber-700">{formatMoney(user.available)} available</span>}
            <Flags user={user} />
          </div>
        </div>
        <ChevronRight aria-hidden className="mt-2.5 size-4 shrink-0 text-secondary-300" />
      </Link>
    </li>
  )
}

/** Tablets and up: the full table. The whole row opens the account. */
function UserTable({ rows, showMoney }: { rows: AdminUserListItem[]; showMoney: boolean }) {
  const router = useRouter()
  const th = "px-4 py-3 text-left text-[11px] font-semibold tracking-[0.08em] text-secondary-500 uppercase"

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[46rem] text-sm">
        <thead className="bg-secondary-50/70">
          <tr>
            <th scope="col" className={cn(th, "pl-5")}>Account</th>
            <th scope="col" className={cn(th, "hidden xl:table-cell")}>Country</th>
            {showMoney && <th scope="col" className={cn(th, "text-right")}>Cash</th>}
            {showMoney && <th scope="col" className={cn(th, "text-right")}>In plans</th>}
            <th scope="col" className={th}>Last seen</th>
            <th scope="col" className={cn(th, "hidden lg:table-cell")}>Joined</th>
            <th scope="col" className={cn(th, "pr-5")}>
              <span className="sr-only">Flags</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary-100">
          {rows.map((user) => {
            const href = `/admin/users/${user.uid}`
            return (
              <tr
                key={user.id}
                onClick={() => router.push(href)}
                className="group cursor-pointer transition-colors hover:bg-primary-50/40"
              >
                <td className="py-3.5 pr-4 pl-5">
                  <div className="flex items-center gap-3">
                    <Avatar user={user} />
                    <div className="min-w-0">
                      {/* The real link, for keyboards and middle-clicks. */}
                      <Link
                        href={href}
                        onClick={(event) => event.stopPropagation()}
                        className={cn("block max-w-56 truncate rounded font-semibold text-secondary-900 group-hover:text-primary-700", focusRing)}
                      >
                        {user.fullName}
                      </Link>
                      <p className="max-w-56 truncate text-xs text-secondary-500">{user.email}</p>
                      <p className="font-mono text-[11px] font-semibold text-secondary-400">{user.uid}</p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3.5 text-secondary-700 xl:table-cell">
                  <Country code={user.country} />
                </td>
                {showMoney && (
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <span className="font-semibold tabular-nums">{formatMoney(user.balance)}</span>
                    {user.balance !== user.available && (
                      <span className="block text-[11px] text-amber-700 tabular-nums">
                        {formatMoney(user.available)} available
                      </span>
                    )}
                  </td>
                )}
                {showMoney && (
                  <td className="px-4 py-3.5 text-right whitespace-nowrap tabular-nums">
                    {isZero(user.inPlans) ? (
                      <span className="text-secondary-400">—</span>
                    ) : (
                      <span className="font-semibold text-primary-700">{formatMoney(user.inPlans)}</span>
                    )}
                  </td>
                )}
                <td className="px-4 py-3.5 whitespace-nowrap text-secondary-600">
                  {user.lastLoginAt ? formatRelative(user.lastLoginAt) : <span className="text-secondary-400">Never</span>}
                </td>
                <td className="hidden px-4 py-3.5 whitespace-nowrap text-secondary-600 tabular-nums lg:table-cell">
                  {formatDate(user.createdAt)}
                </td>
                <td className="py-3.5 pr-5 pl-4">
                  <div className="flex items-center justify-end gap-2">
                    <Flags user={user} />
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-secondary-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600" />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
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

function downloadCsv(rows: AdminUserListItem[], tab: TabKey) {
  const header = [
    "Account ID",
    "Full name",
    "Email",
    "Username",
    "Phone",
    "Country",
    "Role",
    "Status",
    "Email verified",
    "Cash balance (USD)",
    "Available (USD)",
    "In plans (USD)",
    "Last seen",
    "Joined",
  ]
  const body = rows.map((user) => [
    user.uid,
    user.fullName,
    user.email,
    user.username,
    user.phone,
    user.country,
    user.role,
    user.status,
    user.emailVerified ? "Yes" : "No",
    user.balance,
    user.available,
    user.inPlans,
    user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : "",
    new Date(user.createdAt).toISOString(),
  ])
  saveCsv(`bowline-${tab}-${today()}.csv`, toCsv(header, body))
}
