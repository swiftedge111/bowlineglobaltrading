"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Pieces shared by the admin review queues (deposits, withdrawals): summary
 * tiles, row badges, the pager and the "waiting 3h" clock.
 */

export const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

export const focusRing = "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"


export function Tile({
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

export function Badge({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
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

export function PagerButton({
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

export function plural(count: number, noun: string) {
  return `${count.toLocaleString("en-US")} ${noun}${count === 1 ? "" : "s"}`
}

/** "45m", "3h", "2d" since `from`. */
export function waited(from: string | null, now: number) {
  if (!from) return "—"
  const minutes = Math.max(0, Math.floor((now - new Date(from).getTime()) / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
