"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarCheck,
  Check,
  Coins,
  Layers,
  Repeat,
  Sparkles,
  Wallet,
} from "lucide-react"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ErrorState } from "@/components/app/empty-state"
import { SubscriptionCard } from "@/components/plans/subscription-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type { Plan, Subscription, SubscriptionStatus } from "@/lib/api/types"
import { formatDate, formatMoney, formatPercent } from "@/lib/format"
import { projectPlan } from "@/lib/plan-math"
import { useAsyncData } from "@/lib/use-async-data"
import { useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

/** Browse plans, start one, and follow or cancel the ones running. */

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

const DAY_MS = 86_400_000

/** Decimal string to whole cents, for comparisons and sums shown to the user. */
const cents = (value: string | null | undefined) =>
  Math.round(Number(value ?? "0") * 100) || 0
const fromCents = (value: number) => (value / 100).toFixed(2)

const HISTORY_TABS: Array<{ value: SubscriptionStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
]

export function PlansScreen() {
  const toast = useToast()
  const now = useNow(30_000)
  const plans = useAsyncData(() => api.plans.list(), "plans")
  const subs = useAsyncData(() => api.subscriptions.list(), "subscriptions")

  const [subscribing, setSubscribing] = useState<Plan | null>(null)
  const [amount, setAmount] = useState("")
  const [amountError, setAmountError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState<Subscription | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [historyTab, setHistoryTab] = useState<SubscriptionStatus>("ACTIVE")

  const available = subs.data?.available ?? "0.00"
  const subscriptions = useMemo(() => subs.data?.subscriptions ?? [], [subs.data])

  const counts = useMemo(() => {
    const result: Record<SubscriptionStatus, number> = { ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 }
    for (const item of subscriptions) result[item.status] += 1
    return result
  }, [subscriptions])

  const activeList = subscriptions.filter((item) => item.status === "ACTIVE")
  const working = fromCents(activeList.reduce((sum, item) => sum + cents(item.principal), 0))
  const earned = fromCents(subscriptions.reduce((sum, item) => sum + cents(item.totalAccrued), 0))
  const nextPayout = activeList
    .map((item) => item.nextPayoutAt)
    .filter((value): value is string => Boolean(value))
    .sort()[0]

  function openSubscribe(plan: Plan, preset?: string) {
    // Start at the minimum unless the calculator sent an amount; the quick
    // picks offer half or the maximum.
    setSubscribing(plan)
    setAmount(fromCents(cents(preset ?? plan.minDeposit)))
    setAmountError(undefined)
  }

  async function confirmSubscribe() {
    if (!subscribing) return

    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      setAmountError("Enter an amount.")
      return
    }
    const asCents = Math.round(value * 100)
    if (asCents < cents(subscribing.minDeposit)) {
      setAmountError(`${subscribing.name} starts at ${formatMoney(subscribing.minDeposit)}.`)
      return
    }
    if (subscribing.maxDeposit && asCents > cents(subscribing.maxDeposit)) {
      setAmountError(`${subscribing.name} accepts up to ${formatMoney(subscribing.maxDeposit)}.`)
      return
    }
    if (asCents > cents(available)) {
      setAmountError(`That is more than your available ${formatMoney(available)}.`)
      return
    }

    setBusy(true)
    try {
      await api.subscriptions.create(subscribing.slug, value)
      toast.success(
        `${subscribing.name} plan started`,
        "Your first return arrives 24 hours from now."
      )
      setSubscribing(null)
      setHistoryTab("ACTIVE")
      subs.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not start that plan.")
    } finally {
      setBusy(false)
    }
  }

  async function confirmCancel() {
    if (!cancelling) return
    setCancelBusy(true)
    try {
      await api.subscriptions.cancel(cancelling.id)
      toast.success(
        `${cancelling.plan.name} plan cancelled`,
        `${formatMoney(cancelling.principal)} is back in your available balance.`
      )
      setCancelling(null)
      subs.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not cancel that plan.")
      // It may have completed in the meantime; show the current state.
      subs.reload()
    } finally {
      setCancelBusy(false)
    }
  }

  const visibleHistory = subscriptions.filter((item) => item.status === historyTab)

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Investment{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              plans.
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-secondary-600 sm:text-base">
            Each plan pays a fixed daily return for a fixed term, then gives your principal back.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-secondary-200 bg-white py-2.5 pr-2.5 pl-4 shadow-sm">
          <span className="grid size-9 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
            <Wallet aria-hidden className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-secondary-500">Available to invest</p>
            {subs.loading && !subs.data ? (
              <Skeleton className="mt-1 h-5 w-24" />
            ) : (
              <p className="font-heading text-lg font-semibold tabular-nums">{formatMoney(available)}</p>
            )}
          </div>
          <Button asChild size="sm" className="ml-2">
            <Link href="/deposit">
              <ArrowDownToLine aria-hidden /> Deposit
            </Link>
          </Button>
        </div>
      </div>

      {/* How it works */}
      <ol className="grid gap-px overflow-hidden rounded-[1.5rem] border border-secondary-200 bg-secondary-200 sm:grid-cols-3">
        {[
          { icon: Coins, title: "Choose and fund", body: "The principal moves from your available balance into the plan." },
          { icon: Repeat, title: "Earn every 24 hours", body: "A fixed return is paid each day, counted from the moment you start." },
          { icon: CalendarCheck, title: "Principal returned", body: "At the end of the term your principal comes back. Returns are yours to keep." },
        ].map((step, index) => (
          <li key={step.title} className="flex items-start gap-3 bg-white p-4 sm:p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
              <step.icon aria-hidden className="size-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                <span className="mr-1.5 text-xs text-secondary-400 tabular-nums">0{index + 1}</span>
                {step.title}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-secondary-600">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Your plans */}
      {subscriptions.length > 0 && (
        <section aria-labelledby="your-plans-title" className={cn(card, "p-5 sm:p-6")}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 id="your-plans-title" className="font-sans text-base font-semibold">
                Your plans
              </h3>
              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="text-[11px] font-medium text-secondary-500">Capital working</dt>
                  <dd className="font-heading text-xl font-semibold tabular-nums">{formatMoney(working)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-secondary-500">Earned from plans</dt>
                  <dd className="font-heading text-xl font-semibold text-emerald-600 tabular-nums">
                    {formatMoney(earned, { showPlus: true })}
                  </dd>
                </div>
                {nextPayout && (
                  <div>
                    <dt className="text-[11px] font-medium text-secondary-500">Next payout</dt>
                    <dd className="font-heading text-xl font-semibold tabular-nums">
                      {new Date(nextPayout).getTime() > now
                        ? new Date(nextPayout).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                        : "Now"}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div role="tablist" aria-label="Plan status" className="flex w-fit rounded-lg bg-secondary-100 p-0.5">
              {HISTORY_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={historyTab === tab.value}
                  onClick={() => setHistoryTab(tab.value)}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                    focusRing,
                    historyTab === tab.value
                      ? "bg-white text-primary-700 shadow-sm"
                      : "text-secondary-600 hover:text-secondary-900"
                  )}
                >
                  {tab.label}
                  <span className="rounded-full bg-secondary-200/70 px-1.5 text-[10px] tabular-nums">
                    {counts[tab.value]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {visibleHistory.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-5 py-8 text-center text-sm text-secondary-600">
              {historyTab === "ACTIVE"
                ? "No plan is running right now. Pick one below to start earning."
                : `No ${historyTab.toLowerCase()} plans yet.`}
            </p>
          ) : (
            <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleHistory.map((subscription) => (
                <SubscriptionCard
                  key={subscription.id}
                  subscription={subscription}
                  now={now}
                  onCancel={() => setCancelling(subscription)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Catalogue */}
      <section aria-labelledby="catalogue-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h3 id="catalogue-title" className="font-sans text-base font-semibold">
            Choose a plan
          </h3>
          <Link
            href="/calculator"
            className={cn("inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary-700 hover:text-primary-800", focusRing)}
          >
            Try the returns calculator <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>

        {plans.error && !plans.data ? (
          <ErrorState title="Could not load the plans" onRetry={plans.reload} />
        ) : plans.loading && !plans.data ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[30rem] w-full rounded-[1.5rem]" />
            ))}
          </div>
        ) : (plans.data?.plans.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center rounded-[1.5rem] border border-dashed border-secondary-300 bg-white px-6 py-14 text-center">
            <Layers aria-hidden className="size-6 text-secondary-400" />
            <p className="mt-3 font-semibold">No plans are open right now</p>
            <p className="mt-1 text-sm text-secondary-600">Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {plans.data?.plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                available={available}
                balanceKnown={Boolean(subs.data)}
                onStart={() => openSubscribe(plan)}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-secondary-500">
        Returns are paid at the rate shown for the plan&apos;s term and are not compounded.
        Cancelling early returns your principal; returns already paid stay in your balance.
      </p>

      {/* `/plans?plan=gold&amount=25000`, from the calculator. */}
      <Suspense fallback={null}>
        <DeepLink
          plans={plans.data?.plans ?? null}
          ready={Boolean(subs.data)}
          onOpen={openSubscribe}
        />
      </Suspense>

      {/* Start a plan */}
      <ConfirmDialog
        open={subscribing !== null}
        onOpenChange={(next) => !busy && !next && setSubscribing(null)}
        title={subscribing ? `Start the ${subscribing.name} plan` : ""}
        description="The principal leaves your available balance now and earns from this moment."
        confirmLabel="Start plan"
        busy={busy}
        onConfirm={() => void confirmSubscribe()}
      >
        {subscribing && (
          <SubscribeForm
            plan={subscribing}
            available={available}
            amount={amount}
            error={amountError}
            busy={busy}
            onAmount={(value) => {
              setAmount(value)
              setAmountError(undefined)
            }}
          />
        )}
      </ConfirmDialog>

      {/* Cancel a plan */}
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(next) => !cancelBusy && !next && setCancelling(null)}
        title={cancelling ? `Cancel your ${cancelling.plan.name} plan?` : ""}
        description={
          cancelling && (
            <>
              Your {formatMoney(cancelling.principal)} principal returns to your available
              balance now, along with any return already due. The{" "}
              {formatMoney(cancelling.totalAccrued)} you have earned stays yours. No further
              returns are paid after this.
            </>
          )
        }
        confirmLabel="Cancel plan"
        cancelLabel="Keep it running"
        tone="danger"
        busy={cancelBusy}
        onConfirm={() => void confirmCancel()}
      />
    </div>
  )
}

/* -------------------------------------------------------------- deep link */

/**
 * Opens the start dialog for `?plan=…&amount=…` once, then strips the query so
 * a refresh or a back navigation does not reopen it.
 *
 * Its own component so `useSearchParams` sits inside a Suspense boundary.
 */
function DeepLink({
  plans,
  ready,
  onOpen,
}: {
  plans: Plan[] | null
  ready: boolean
  onOpen: (plan: Plan, amount?: string) => void
}) {
  const params = useSearchParams()
  const handled = useRef(false)
  // The parent passes a fresh function each render; read the latest at call time.
  const openRef = useRef(onOpen)
  useEffect(() => {
    openRef.current = onOpen
  })

  useEffect(() => {
    if (handled.current || !plans || !ready) return
    const slug = params.get("plan")
    if (!slug) return
    handled.current = true

    const plan = plans.find((item) => item.slug === slug)
    const amount = params.get("amount")
    window.history.replaceState(null, "", window.location.pathname)
    if (!plan) return

    // Deferred: opening the dialog is a state change, kept out of the
    // effect's synchronous body. Not cancelled on re-render: `handled` already
    // guarantees it runs once.
    setTimeout(
      () => openRef.current(plan, amount && Number(amount) > 0 ? amount : undefined),
      0
    )
  }, [plans, ready, params])

  return null
}

/* -------------------------------------------------------------- plan card */

function PlanCard({
  plan,
  available,
  balanceKnown,
  onStart,
}: {
  plan: Plan
  available: string
  balanceKnown: boolean
  onStart: () => void
}) {
  const featured = plan.isPopular
  const example = projectPlan(plan, Number(plan.minDeposit))
  const shortfall = cents(plan.minDeposit) - cents(available)
  const canStart = !balanceKnown || shortfall <= 0

  return (
    <article
      className={cn(
        "relative isolate flex h-full flex-col overflow-hidden rounded-[1.5rem] p-6 transition-all",
        featured
          ? "bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 text-white shadow-xl shadow-primary-900/20"
          : "border border-secondary-200 bg-white shadow-sm hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-900/5"
      )}
    >
      {featured && (
        <>
          <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 -z-10 size-56 rounded-full bg-sky-400/25 blur-3xl" />
          <span className="absolute top-5 right-5 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-sky-100 uppercase ring-1 ring-white/20">
            <Sparkles aria-hidden className="size-3" /> Most popular
          </span>
        </>
      )}

      <h4 className={cn("text-xl font-semibold tracking-tight", featured ? "text-white" : "text-secondary-900")}>
        {plan.name}
      </h4>
      {plan.description && (
        <p className={cn("mt-1.5 line-clamp-2 text-sm leading-relaxed", featured ? "text-primary-100" : "text-secondary-600")}>
          {plan.description}
        </p>
      )}

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className={cn("font-heading text-5xl font-semibold tracking-tight tabular-nums", featured ? "text-white" : "text-primary-700")}>
          {formatPercent(plan.dailyReturnPercent)}
        </span>
        <span className={cn("text-sm", featured ? "text-primary-100" : "text-secondary-500")}>/ day</span>
      </div>
      <p className={cn("mt-1 text-sm font-medium tabular-nums", featured ? "text-emerald-200" : "text-emerald-600")}>
        {formatPercent(example.termPercent)} over {plan.durationDays} days
      </p>

      <dl
        className={cn(
          "mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl text-sm",
          featured ? "bg-white/10" : "bg-secondary-200"
        )}
      >
        {[
          { label: "Term", value: `${plan.durationDays} days` },
          { label: "Minimum", value: formatMoney(plan.minDeposit) },
          { label: "Maximum", value: plan.maxDeposit ? formatMoney(plan.maxDeposit) : "No cap" },
          { label: "Paid", value: "Every 24h" },
        ].map((entry) => (
          <div key={entry.label} className={cn("px-3 py-2.5", featured ? "bg-primary-900/60" : "bg-white")}>
            <dt className={cn("text-[11px]", featured ? "text-primary-100" : "text-secondary-500")}>{entry.label}</dt>
            <dd className="mt-0.5 truncate font-semibold tabular-nums">{entry.value}</dd>
          </div>
        ))}
      </dl>

      <p
        className={cn(
          "mt-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed",
          featured ? "bg-white/[0.07] text-primary-100" : "bg-emerald-50/70 text-secondary-600"
        )}
      >
        {formatMoney(plan.minDeposit)} earns{" "}
        <span className={cn("font-semibold tabular-nums", featured ? "text-emerald-200" : "text-emerald-700")}>
          {formatMoney(example.daily)} a day
        </span>
        , or {formatMoney(example.returns)} over the term.
      </p>

      {plan.features.length > 0 && (
        <ul className="mt-5 space-y-2">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <Check aria-hidden className={cn("mt-0.5 size-4 shrink-0", featured ? "text-sky-300" : "text-primary-600")} />
              <span className={featured ? "text-white/90" : "text-secondary-600"}>{feature}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-6">
        {canStart ? (
          <Button
            onClick={onStart}
            variant={featured ? "inverse" : "default"}
            className="w-full"
          >
            Start {plan.name}
            <ArrowRight aria-hidden className="transition-transform group-hover/button:translate-x-0.5" />
          </Button>
        ) : (
          <>
            <Button
              asChild
              variant={featured ? "ghostInverse" : "ghost"}
              className={cn("w-full", !featured && "border border-secondary-300 text-secondary-800 hover:border-primary-300 hover:bg-white hover:text-primary-700")}
            >
              <Link href="/deposit">
                <ArrowDownToLine aria-hidden /> Deposit to start
              </Link>
            </Button>
            <p className={cn("mt-2 text-center text-xs tabular-nums", featured ? "text-primary-100" : "text-secondary-500")}>
              {formatMoney(fromCents(shortfall))} more needed
            </p>
          </>
        )}
      </div>
    </article>
  )
}

/* ---------------------------------------------------------- subscribe form */

function SubscribeForm({
  plan,
  available,
  amount,
  error,
  busy,
  onAmount,
}: {
  plan: Plan
  available: string
  amount: string
  error?: string
  busy: boolean
  onAmount: (value: string) => void
}) {
  const min = cents(plan.minDeposit)
  const max = plan.maxDeposit ? Math.min(cents(plan.maxDeposit), cents(available)) : cents(available)
  const value = Number(amount)
  const valid = Number.isFinite(value) && value > 0
  const projection = projectPlan(plan, valid ? value : 0)
  const after = cents(available) - Math.round((valid ? value : 0) * 100)
  // Read the clock once per render of the form, for the maturity preview.
  const [opened] = useState(() => Date.now())
  const maturesOn = new Date(opened + plan.durationDays * DAY_MS)

  // Quick picks inside the plan's range and what is available.
  const picks = [
    { label: "Minimum", value: min },
    { label: "Half", value: Math.round(cents(available) / 2) },
    { label: "Maximum", value: max },
  ].filter(
    (pick, index, list) =>
      pick.value >= min &&
      pick.value <= max &&
      list.findIndex((other) => other.value === pick.value) === index
  )

  return (
    <div className="space-y-4">
      <Input
        id="subscribe-amount"
        label="Amount to invest (USD)"
        type="number"
        inputMode="decimal"
        step="0.01"
        min={plan.minDeposit}
        value={amount}
        onChange={(event) => onAmount(event.target.value)}
        error={error}
        hint={`${formatMoney(plan.minDeposit)}${plan.maxDeposit ? ` to ${formatMoney(plan.maxDeposit)}` : " and up"} · ${formatMoney(available)} available`}
        disabled={busy}
      />

      {picks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picks.map((pick) => (
            <button
              key={pick.label}
              type="button"
              disabled={busy}
              onClick={() => onAmount(fromCents(pick.value))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                focusRing,
                cents(amount) === pick.value
                  ? "border-primary-600 bg-primary-50 text-primary-700"
                  : "border-secondary-200 text-secondary-600 hover:border-primary-300 hover:text-primary-700"
              )}
            >
              {pick.label} · {formatMoney(fromCents(pick.value))}
            </button>
          ))}
        </div>
      )}

      {after < 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            You need <span className="font-semibold tabular-nums">{formatMoney(fromCents(-after))}</span> more
            to start this.
          </span>
          <Link
            href="/deposit"
            className={cn("inline-flex shrink-0 items-center gap-1 rounded-md font-semibold text-amber-900 underline underline-offset-4", focusRing)}
          >
            Deposit <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </div>
      )}

      <dl className="divide-y divide-secondary-100 rounded-2xl border border-secondary-200 bg-secondary-50/60 text-sm">
        {[
          { label: "Daily return", value: formatMoney(projection.daily, { showPlus: true }), tone: "text-emerald-600" },
          { label: `Returns over ${plan.durationDays} days`, value: formatMoney(projection.returns, { showPlus: true }), tone: "text-emerald-600" },
          { label: "Paid back by the end", value: formatMoney(projection.atMaturity), tone: "text-secondary-900" },
          { label: "Plan ends", value: formatDate(maturesOn), tone: "text-secondary-900" },
          {
            label: "Available after",
            value: formatMoney(fromCents(after)),
            tone: after < 0 ? "text-red-600" : "text-secondary-900",
          },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-secondary-600">{row.label}</dt>
            <dd className={cn("font-semibold tabular-nums", row.tone)}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
