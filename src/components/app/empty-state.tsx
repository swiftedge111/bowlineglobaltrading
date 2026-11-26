import Link from "next/link"
import { AlertCircle, RotateCw, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Empty state for a list that finished loading successfully. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; href: string }
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-secondary-200 bg-secondary-50/50 px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-white text-secondary-400 shadow-sm">
          <Icon className="size-5" />
        </span>
      )}
      <p className="font-semibold text-secondary-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-secondary-600">{description}</p>
      )}
      {action && (
        <Button asChild size="sm" className="mt-5">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}

/**
 * The third state. Always offers a retry — a dead end with no way forward is
 * the one outcome worse than the error itself.
 */
export function ErrorState({
  title = "Could not load this",
  description,
  onRetry,
  className,
}: {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/60 px-6 py-12 text-center",
        className
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-white text-red-500 shadow-sm">
        <AlertCircle className="size-5" />
      </span>
      <p className="font-semibold text-secondary-900">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-secondary-600">{description}</p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-5">
          <RotateCw className="size-4" />
          Try again
        </Button>
      )}
    </div>
  )
}
