"use client"

import { useState } from "react"
import { Dialog } from "radix-ui"
import {
  CalendarClock,
  Coins,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Star,
  Trash2,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { card, focusRing, plural } from "@/components/admin/queue-parts"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ErrorState } from "@/components/app/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type { AdminPlan, PlanInput } from "@/lib/api/types"
import { formatMoney, formatPercent, isZero } from "@/lib/format"
import { projectPlan } from "@/lib/plan-math"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/**
 * Plan administration: rates, terms, limits and what the public plans page
 * shows.
 *
 * Each subscription keeps the rate and end date it started with, so editing a
 * plan only changes what new subscriptions get. The cards show what every plan
 * has running and still owes, so a change is made knowing what rides on it.
 */

/** Form state is strings: a half-typed number is not a number. */
interface PlanForm {
  slug: string
  name: string
  dailyReturnPercent: string
  durationDays: string
  minDeposit: string
  maxDeposit: string
  referralBonusPercent: string
  description: string
  features: string
  isPopular: boolean
  isActive: boolean
  sortOrder: string
}

const BLANK: PlanForm = {
  slug: "",
  name: "",
  dailyReturnPercent: "",
  durationDays: "",
  minDeposit: "",
  maxDeposit: "",
  referralBonusPercent: "0",
  description: "",
  features: "",
  isPopular: false,
  isActive: true,
  sortOrder: "0",
}

function toForm(plan: AdminPlan): PlanForm {
  return {
    slug: plan.slug,
    name: plan.name,
    dailyReturnPercent: plan.dailyReturnPercent,
    durationDays: String(plan.durationDays),
    minDeposit: plan.minDeposit,
    maxDeposit: plan.maxDeposit ?? "",
    referralBonusPercent: String(plan.referralBonusPercent),
    description: plan.description ?? "",
    features: plan.features.join("\n"),
    isPopular: plan.isPopular,
    isActive: plan.isActive,
    sortOrder: String(plan.sortOrder),
  }
}

/**
 * Percent in the form, basis points on the wire. The column is integer bps so
 * accrual never touches a float; the rounding happens here, once.
 */
function toPayload(form: PlanForm): PlanInput {
  const trimmedMax = form.maxDeposit.trim()
  return {
    slug: form.slug.trim().toLowerCase(),
    name: form.name.trim(),
    dailyReturnBps: Math.round(Number(form.dailyReturnPercent) * 100),
    durationDays: Number(form.durationDays),
    minDeposit: Number(form.minDeposit),
    maxDeposit: trimmedMax === "" ? null : Number(trimmedMax),
    referralBonusPercent: Number(form.referralBonusPercent || 0),
    description: form.description.trim(),
    features: form.features
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    isPopular: form.isPopular,
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder || 0),
  }
}

type Field = keyof PlanForm

/** Every problem at once, keyed by field. Mirrors the server's own rules. */
function validate(form: PlanForm): Partial<Record<Field, string>> {
  const issues: Partial<Record<Field, string>> = {}
  const slug = form.slug.trim().toLowerCase()
  if (!slug) issues.slug = "Required."
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) issues.slug = "Lowercase letters, numbers and single hyphens."
  if (!form.name.trim()) issues.name = "Required."
  if (!form.description.trim()) issues.description = "Required."

  const rate = Number(form.dailyReturnPercent)
  if (form.dailyReturnPercent.trim() === "" || !Number.isFinite(rate) || rate <= 0) issues.dailyReturnPercent = "Above zero."
  else if (rate > 100) issues.dailyReturnPercent = "At most 100%."

  const days = Number(form.durationDays)
  if (!Number.isInteger(days) || days < 1) issues.durationDays = "Whole days, at least 1."

  const min = Number(form.minDeposit)
  if (form.minDeposit.trim() === "" || !Number.isFinite(min) || min < 0) issues.minDeposit = "Not a valid amount."

  const maxRaw = form.maxDeposit.trim()
  if (maxRaw !== "") {
    const max = Number(maxRaw)
    if (!Number.isFinite(max) || max <= 0) issues.maxDeposit = "Not a valid amount."
    else if (Number.isFinite(min) && max < min) issues.maxDeposit = "Below the minimum."
  }

  const referral = Number(form.referralBonusPercent || 0)
  if (!Number.isInteger(referral) || referral < 0 || referral > 100) issues.referralBonusPercent = "Whole percent, 0 to 100."
  return issues
}

/** "75.00%": what the rate earns over the whole term, as simple interest. */
function termReturn(percent: string, days: number) {
  const bps = Math.round(Number(percent) * 100)
  if (!Number.isFinite(bps) || days < 1) return "—"
  return formatPercent(((bps * days) / 100).toFixed(2))
}

type Editor = { mode: "create" | "edit"; plan: AdminPlan | null; form: PlanForm }

export function AdminPlansScreen() {
  const toast = useToast()
  const data = useAsyncData(() => api.admin.plans(), "admin-plans")
  const [editor, setEditor] = useState<Editor | null>(null)
  const [retiring, setRetiring] = useState<AdminPlan | null>(null)
  const [retireBusy, setRetireBusy] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const plans = data.data?.plans ?? []
  const live = plans.filter((plan) => plan.isActive)
  const totals = plans.reduce(
    (sum, plan) => ({
      principal: sum.principal + cents(plan.subscriptions.activePrincipal),
      paid: sum.paid + cents(plan.subscriptions.paidOut),
      owed: sum.owed + cents(plan.subscriptions.owedToMaturity),
      running: sum.running + plan.subscriptions.active,
    }),
    { principal: 0, paid: 0, owed: 0, running: 0 }
  )

  function duplicate(plan: AdminPlan) {
    const form = toForm(plan)
    setEditor({
      mode: "create",
      plan: null,
      // Hidden until it has been checked, so a copy never goes live by accident.
      form: { ...form, slug: `${plan.slug}-copy`, name: `${plan.name} copy`, isActive: false, isPopular: false },
    })
  }

  async function toggleActive(plan: AdminPlan) {
    setToggling(plan.id)
    try {
      await api.admin.updatePlan(plan.id, { isActive: !plan.isActive })
      toast.success(plan.isActive ? `${plan.name} hidden` : `${plan.name} is live`)
      data.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not change the plan's status.")
    } finally {
      setToggling(null)
    }
  }

  async function retire() {
    if (!retiring) return
    setRetireBusy(true)
    try {
      const result = await api.admin.retirePlan(retiring.id)
      toast.success(
        result.deleted ? `${retiring.name} deleted` : `${retiring.name} retired`,
        result.deleted ? undefined : "Running subscriptions keep paying until they mature."
      )
      setRetiring(null)
      data.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not retire the plan.")
    } finally {
      setRetireBusy(false)
    }
  }

  if (data.error && !data.data) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <ErrorState title="Could not load plans" description="The API may be unreachable." onRetry={data.reload} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Investment{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">plans.</span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            Rates, terms and limits. Edits apply to new subscriptions; running ones keep what they signed up for.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create", plan: null, form: BLANK })}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-xl bg-primary-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-800",
            focusRing
          )}
        >
          <Plus aria-hidden className="size-4" /> New plan
        </button>
      </div>

      {/* Book */}
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat icon={Coins} label="Live plans" value={data.data ? `${live.length} of ${plans.length}` : undefined} sub="On the public plans page" />
        <Stat
          icon={Wallet}
          label="Principal in plans"
          value={data.data ? formatMoney((totals.principal / 100).toFixed(2)) : undefined}
          sub={data.data ? plural(totals.running, "running subscription") : undefined}
        />
        <Stat
          icon={TrendingUp}
          label="Returns paid"
          value={data.data ? formatMoney((totals.paid / 100).toFixed(2)) : undefined}
          sub="To date, all plans"
          tone="good"
        />
        <Stat
          icon={CalendarClock}
          label="Returns still owed"
          value={data.data ? formatMoney((totals.owed / 100).toFixed(2)) : undefined}
          sub="Until running plans mature"
          tone={totals.owed > 0 ? "warn" : "plain"}
        />
      </dl>

      {!data.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-80 rounded-[1.5rem]" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <div className={cn(card, "flex flex-col items-center px-6 py-14 text-center")}>
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
            <Coins aria-hidden className="size-6" />
          </span>
          <p className="mt-4 font-semibold">No plans yet</p>
          <p className="mt-1 max-w-sm text-sm text-secondary-600">Create one and it appears on the public plans page as soon as it is live.</p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              toggling={toggling === plan.id}
              onEdit={() => setEditor({ mode: "edit", plan, form: toForm(plan) })}
              onDuplicate={() => duplicate(plan)}
              onToggle={() => void toggleActive(plan)}
              onRetire={() => setRetiring(plan)}
            />
          ))}
        </ul>
      )}

      {editor && (
        <PlanEditor
          key={editor.plan?.id ?? `new-${editor.form.slug}`}
          editor={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            data.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={retiring !== null}
        onOpenChange={(next) => !retireBusy && !next && setRetiring(null)}
        title={`Retire ${retiring?.name ?? "this plan"}?`}
        description={
          retiring && retiring.subscriptions.total > 0
            ? `It has subscriptions, so it will be hidden and kept rather than deleted. ${
                retiring.subscriptions.active > 0
                  ? `${plural(retiring.subscriptions.active, "running subscription")} (${formatMoney(retiring.subscriptions.activePrincipal)}) keep paying until they mature.`
                  : "None are running."
              }`
            : "Nobody has ever subscribed to it, so it will be deleted outright."
        }
        confirmLabel="Retire"
        tone="danger"
        busy={retireBusy}
        onConfirm={() => void retire()}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- card */

function PlanCard({
  plan,
  toggling,
  onEdit,
  onDuplicate,
  onToggle,
  onRetire,
}: {
  plan: AdminPlan
  toggling: boolean
  onEdit: () => void
  onDuplicate: () => void
  onToggle: () => void
  onRetire: () => void
}) {
  const s = plan.subscriptions
  const example = projectPlan(plan, Number(plan.minDeposit))

  return (
    <li className={cn(card, "flex flex-col overflow-hidden", !plan.isActive && "border-dashed bg-secondary-50/60 shadow-none")}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold tracking-tight">{plan.name}</h3>
              {plan.isPopular && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  <Star aria-hidden className="size-3 fill-amber-400 text-amber-500" /> Popular
                </span>
              )}
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  plan.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-secondary-200 bg-white text-secondary-600"
                )}
              >
                {plan.isActive ? "Live" : "Hidden"}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-secondary-400">
              /{plan.slug} · position {plan.sortOrder}
            </p>
          </div>
          <div className="text-right">
            <p className="font-heading text-3xl font-semibold tracking-tight text-primary-700 tabular-nums">{formatPercent(plan.dailyReturnPercent)}</p>
            <p className="text-xs text-secondary-500">a day for {plan.durationDays} days</p>
          </div>
        </div>

        {plan.description && <p className="mt-3 line-clamp-2 text-sm text-secondary-600">{plan.description}</p>}

        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Fact
            className="col-span-2 sm:order-2 sm:col-span-1"
            label="Deposit"
            value={plan.maxDeposit ? `${dollars(plan.minDeposit)} – ${dollars(plan.maxDeposit)}` : `${dollars(plan.minDeposit)} and up`}
          />
          <Fact className="sm:order-1" label="Over the term" value={termReturn(plan.dailyReturnPercent, plan.durationDays)} />
          <Fact className="sm:order-3" label="Referral" value={`${plan.referralBonusPercent}%`} />
        </dl>
        {!isZero(plan.minDeposit) && (
          <p className="mt-3 text-xs text-secondary-500">
            {formatMoney(plan.minDeposit)} earns {formatMoney(example.daily)} a day, {formatMoney(example.returns)} over the term.
          </p>
        )}
      </div>

      {/* What rides on it */}
      <div className="mt-auto border-t border-secondary-200 bg-secondary-50/70 px-5 py-4 sm:px-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <Fact label="Running" value={String(s.active)} sub={`${s.total} ever`} />
          <Fact label="Principal" value={formatMoney(s.activePrincipal)} />
          <Fact label="Paid out" value={formatMoney(s.paidOut)} tone="good" />
          <Fact label="Still owed" value={formatMoney(s.owedToMaturity)} />
        </dl>
        {(s.maturingThisWeek > 0 || s.onOlderRate > 0) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.maturingThisWeek > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                <CalendarClock aria-hidden className="size-3" /> {s.maturingThisWeek} maturing this week
              </span>
            )}
            {s.onOlderRate > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-secondary-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-secondary-700">
                <Lock aria-hidden className="size-3" /> {s.onOlderRate} on an earlier rate
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-secondary-200 px-3 py-2.5 sm:px-4">
        <CardAction icon={Pencil} label="Edit" onClick={onEdit} />
        <CardAction icon={Copy} label="Duplicate" onClick={onDuplicate} />
        <CardAction
          icon={toggling ? Loader2 : plan.isActive ? EyeOff : Eye}
          label={plan.isActive ? "Hide" : "Make live"}
          onClick={onToggle}
          disabled={toggling}
          spin={toggling}
        />
        <button
          type="button"
          onClick={onRetire}
          aria-label={`Retire ${plan.name}`}
          title="Retire"
          className={cn("ml-auto grid size-9 place-items-center rounded-lg text-secondary-400 transition-colors hover:bg-red-50 hover:text-red-600", focusRing)}
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
    </li>
  )
}

function CardAction({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  spin = false,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  spin?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-secondary-700 transition-colors hover:bg-secondary-100 hover:text-primary-700 disabled:opacity-50",
        focusRing
      )}
    >
      <Icon aria-hidden className={cn("size-4", spin && "animate-spin")} />
      {label}
    </button>
  )
}

function Fact({
  label,
  value,
  sub,
  tone = "plain",
  className,
}: {
  label: string
  value: string
  sub?: string
  tone?: "plain" | "good"
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] text-secondary-500">{label}</dt>
      <dd className={cn("truncate font-semibold tabular-nums", tone === "good" && "text-emerald-600")}>{value}</dd>
      {sub && <dd className="text-[11px] text-secondary-500">{sub}</dd>}
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone = "plain",
}: {
  icon: LucideIcon
  label: string
  value: string | undefined
  sub?: string
  tone?: "plain" | "good" | "warn"
}) {
  return (
    <div className={cn(card, "min-w-0 p-4 sm:p-5")}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg ring-1",
            tone === "good" && "bg-emerald-50 text-emerald-600 ring-emerald-100",
            tone === "warn" && "bg-amber-50 text-amber-600 ring-amber-200",
            tone === "plain" && "bg-primary-50 text-primary-700 ring-primary-100"
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <dt className="text-xs leading-tight text-secondary-600 sm:text-sm">{label}</dt>
      </div>
      <dd className="mt-3">
        {value === undefined ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <span className="block truncate font-heading text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</span>
        )}
        <span className="mt-0.5 block truncate text-[11px] text-secondary-500 sm:text-xs">{sub ?? " "}</span>
      </dd>
    </div>
  )
}

/* ------------------------------------------------------------------ editor */

function PlanEditor({ editor, onClose, onSaved }: { editor: Editor; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState<PlanForm>(editor.form)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const editing = editor.mode === "edit" && editor.plan !== null
  const original = editor.plan

  const issues = validate(form)
  const shown = touched ? issues : {}
  const valid = Object.keys(issues).length === 0

  const set = <K extends Field>(key: K, value: PlanForm[K]) => setForm((current) => ({ ...current, [key]: value }))

  const rateChanged = editing && original !== null && Math.round(Number(form.dailyReturnPercent) * 100) !== Math.round(Number(original.dailyReturnPercent) * 100)
  const termChanged = editing && original !== null && Number(form.durationDays) !== original.durationDays
  const running = original?.subscriptions.active ?? 0

  const days = Number(form.durationDays)
  const previewPlan = { dailyReturnPercent: form.dailyReturnPercent || "0", durationDays: Number.isInteger(days) && days > 0 ? days : 0 }
  const previewAmount = Number(form.minDeposit) > 0 ? form.minDeposit : "1000"
  const projection = projectPlan(previewPlan, Number(previewAmount))

  async function save() {
    setTouched(true)
    if (!valid) {
      toast.error("Check the highlighted fields.")
      return
    }
    setBusy(true)
    try {
      const payload = toPayload(form)
      if (editing && original) {
        // The slug is fixed once a plan exists; links and bookmarks use it.
        const { slug: _slug, ...changes } = payload
        void _slug
        await api.admin.updatePlan(original.id, changes)
        toast.success(`${payload.name} saved`)
      } else {
        await api.admin.createPlan(payload)
        toast.success(`${payload.name} created`, payload.isActive ? "It is live on the plans page." : "It is hidden until you make it live.")
      }
      onSaved()
    } catch (cause) {
      toast.fromError(cause, "Could not save the plan.")
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
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-secondary-50 text-secondary-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-secondary-200 bg-white px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold">{editing ? `Edit ${original?.name}` : "New plan"}</Dialog.Title>
              <p className="text-xs text-secondary-500">{editing ? "Changes apply to new subscriptions." : "Appears on the plans page once it is live."}</p>
            </div>
            <Dialog.Close aria-label="Close" disabled={busy} className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-secondary-500 hover:bg-secondary-100", focusRing)}>
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {/* Live preview */}
            <section className="relative isolate overflow-hidden rounded-[1.25rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-5 text-white">
              <div aria-hidden className="pointer-events-none absolute -top-16 -right-12 -z-10 size-44 rounded-full bg-sky-400/20 blur-3xl" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">Preview</p>
                  <p className="mt-1 truncate text-xl font-semibold">{form.name.trim() || "Plan name"}</p>
                </div>
                {form.isPopular && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-300/40">
                    <Star aria-hidden className="size-3" /> Most popular
                  </span>
                )}
              </div>
              <p className="mt-3 font-heading text-4xl font-medium tracking-tight tabular-nums">
                {form.dailyReturnPercent ? formatPercent(form.dailyReturnPercent) : "0.00%"}
                <span className="ml-2 text-sm font-normal text-primary-100">a day · {previewPlan.durationDays || "–"} days</span>
              </p>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white/15 pt-3 text-sm">
                <div>
                  <dt className="text-[11px] text-primary-100">{formatMoney(previewAmount)} earns</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(projection.daily)}/day</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-primary-100">Over the term</dt>
                  <dd className="font-semibold tabular-nums">{formatMoney(projection.returns)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-primary-100">Total return</dt>
                  <dd className="font-semibold tabular-nums">{termReturn(previewPlan.dailyReturnPercent, previewPlan.durationDays)}</dd>
                </div>
              </dl>
            </section>

            {(rateChanged || termChanged) && running > 0 && (
              <p className="flex gap-2 rounded-xl bg-primary-50 p-3 text-xs leading-relaxed text-primary-900 ring-1 ring-primary-200">
                <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary-600" />
                {plural(running, "running subscription")} keep{running === 1 ? "s" : ""} {original?.dailyReturnPercent}% a day for{" "}
                {original?.durationDays} days, as agreed when they started. Only new subscriptions get the new{" "}
                {[rateChanged && "rate", termChanged && "term"].filter(Boolean).join(" and ")}.
              </p>
            )}

            <Section title="Name and address">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id="plan-name" label="Name" placeholder="Gold" value={form.name} error={shown.name} disabled={busy} onChange={(value) => set("name", value)} />
                <TextField
                  id="plan-slug"
                  label="Slug"
                  placeholder="gold"
                  value={form.slug}
                  error={shown.slug}
                  disabled={busy || editing}
                  mono
                  hint={editing ? "Fixed once the plan exists." : "Used in links, e.g. /plans?plan=gold"}
                  onChange={(value) => set("slug", value.toLowerCase().replace(/\s+/g, "-"))}
                />
              </div>
            </Section>

            <Section title="Returns">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id="plan-rate" label="Daily return" suffix="%" inputMode="decimal" placeholder="2.50" value={form.dailyReturnPercent} error={shown.dailyReturnPercent} disabled={busy} onChange={(value) => set("dailyReturnPercent", value.replace(/[^\d.]/g, ""))} />
                <TextField id="plan-days" label="Duration" suffix="days" inputMode="numeric" placeholder="30" value={form.durationDays} error={shown.durationDays} disabled={busy} onChange={(value) => set("durationDays", value.replace(/\D/g, ""))} />
              </div>
              <p className="text-xs text-secondary-500">Paid every 24 hours from when a client starts. The principal comes back at the end.</p>
            </Section>

            <Section title="Deposit limits">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id="plan-min" label="Minimum" prefix="$" inputMode="decimal" value={form.minDeposit} error={shown.minDeposit} disabled={busy} onChange={(value) => set("minDeposit", value.replace(/[^\d.]/g, ""))} />
                <TextField id="plan-max" label="Maximum" prefix="$" inputMode="decimal" placeholder="No cap" hint="Leave blank for no cap." value={form.maxDeposit} error={shown.maxDeposit} disabled={busy} onChange={(value) => set("maxDeposit", value.replace(/[^\d.]/g, ""))} />
              </div>
              <TextField id="plan-referral" label="Referral bonus" suffix="%" inputMode="numeric" value={form.referralBonusPercent} error={shown.referralBonusPercent} disabled={busy} onChange={(value) => set("referralBonusPercent", value.replace(/\D/g, ""))} />
            </Section>

            <Section title="On the plans page">
              <div>
                <label htmlFor="plan-description" className="mb-1.5 block text-sm font-medium text-secondary-700">
                  Description
                </label>
                <textarea
                  id="plan-description"
                  rows={2}
                  value={form.description}
                  disabled={busy}
                  maxLength={500}
                  onChange={(event) => set("description", event.target.value)}
                  aria-invalid={Boolean(shown.description)}
                  className="w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 aria-[invalid=true]:border-red-300"
                />
                {shown.description && <p className="mt-1 text-xs text-red-600">{shown.description}</p>}
              </div>
              <div>
                <label htmlFor="plan-features" className="mb-1.5 block text-sm font-medium text-secondary-700">
                  Features <span className="text-xs font-normal text-secondary-400">one per line, shown as ticks</span>
                </label>
                <textarea
                  id="plan-features"
                  rows={4}
                  value={form.features}
                  disabled={busy}
                  onChange={(event) => set("features", event.target.value)}
                  placeholder={"Daily payouts\nPrincipal returned at maturity\nPriority support"}
                  className="w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100"
                />
              </div>
              <TextField id="plan-order" label="Position" inputMode="numeric" hint="Lowest first on the plans page." value={form.sortOrder} disabled={busy} onChange={(value) => set("sortOrder", value.replace(/\D/g, ""))} />
              <Switch checked={form.isActive} disabled={busy} onChange={(next) => set("isActive", next)} label="Live on the plans page" hint="Off keeps the plan and anything running on it, but clients cannot start it." />
              <Switch checked={form.isPopular} disabled={busy} onChange={(next) => set("isPopular", next)} label="Highlight as most popular" hint="Shown as the featured card on the plans page." />
            </Section>
          </div>

          <div className="flex gap-2 border-t border-secondary-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Dialog.Close disabled={busy} className={cn("h-12 rounded-xl px-4 text-sm font-semibold text-secondary-700 hover:bg-secondary-100", focusRing)}>
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className={cn("flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-700 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 disabled:opacity-50", focusRing)}
            >
              {busy && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create plan"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-secondary-200">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  disabled,
  prefix,
  suffix,
  mono = false,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string | undefined
  hint?: string
  placeholder?: string
  disabled: boolean
  prefix?: string
  suffix?: string
  mono?: boolean
  inputMode?: "decimal" | "numeric"
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-secondary-700">
        {label}
      </label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-secondary-400">{prefix}</span>}
        <input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          className={cn(
            "h-11 w-full rounded-xl border border-secondary-200 bg-white text-sm outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 disabled:bg-secondary-50 disabled:text-secondary-500 aria-[invalid=true]:border-red-300",
            prefix ? "pl-7" : "pl-3.5",
            suffix ? "pr-14" : "pr-3.5",
            mono && "font-mono",
            inputMode && "tabular-nums"
          )}
        />
        {suffix && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-secondary-400">{suffix}</span>}
      </div>
      {(error || hint) && (
        <p id={`${id}-note`} className={cn("mt-1 text-xs", error ? "text-red-600" : "text-secondary-500")}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

function Switch({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  disabled: boolean
  onChange: (next: boolean) => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("flex w-full items-start gap-3 rounded-xl bg-secondary-50 p-3.5 text-left ring-1 ring-secondary-200", focusRing)}
    >
      <span className={cn("mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", checked ? "bg-primary-600" : "bg-secondary-300")}>
        <span className={cn("size-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
      </span>
      <span className="text-sm text-secondary-800">
        {label}
        <span className="mt-0.5 block text-xs text-secondary-500">{hint}</span>
      </span>
    </button>
  )
}

/** "$4,999" rather than "$4,999.00" when there are no cents to show. */
function dollars(value: string) {
  return formatMoney(value).replace(/\.00$/, "")
}

function cents(value: string) {
  return Math.round(Number(value) * 100)
}
