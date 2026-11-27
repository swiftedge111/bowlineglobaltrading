"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Calculator as CalculatorIcon, Check, Info, Sparkles } from "lucide-react"

import { AreaChart } from "@/components/app/area-chart"
import { ErrorState } from "@/components/app/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/lib/api/endpoints"
import type { Plan } from "@/lib/api/types"
import { formatDate, formatMoney, formatPercent } from "@/lib/format"
import { projectPlan } from "@/lib/plan-math"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/**
 * Two calculators.
 *
 * "Plan returns" uses the live plans and the same cent-by-cent arithmetic the
 * server pays with, so its figures are what a plan actually pays. Returns are
 * simple: each day's return is paid out, not reinvested.
 *
 * "Custom rate" is a free projection at any rate, simple or compound. It is
 * hypothetical, and says so, because no plan compounds.
 */

const DAY_MS = 86_400_000

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

type Mode = "plans" | "custom"

export function CalculatorScreen() {
  const [mode, setMode] = useState<Mode>("plans")

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Returns{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              calculator.
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-secondary-600 sm:text-base">
            See exactly what a plan pays before you start it, or try any rate you like.
          </p>
        </div>
        <div role="tablist" aria-label="Calculator" className="flex w-fit rounded-xl bg-white p-1 shadow-sm ring-1 ring-secondary-200">
          {([
            ["plans", "Plan returns"],
            ["custom", "Custom rate"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "min-h-9 rounded-lg px-4 text-sm font-semibold transition-colors",
                focusRing,
                mode === value ? "bg-primary-700 text-white shadow-sm" : "text-secondary-600 hover:text-secondary-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "plans" ? <PlanCalculator /> : <CustomCalculator />}
    </div>
  )
}

/* ------------------------------------------------------------ plan returns */

function PlanCalculator() {
  const plans = useAsyncData(() => api.plans.list(), "plans")
  const list = useMemo(() => plans.data?.plans ?? [], [plans.data])

  const [slug, setSlug] = useState<string | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  // One clock reading for the end-date preview, taken when the screen opens.
  const [opened] = useState(() => Date.now())

  const plan =
    list.find((item) => item.slug === slug) ?? list.find((item) => item.isPopular) ?? list[0]

  if (plans.error && !plans.data) {
    return <ErrorState title="Could not load the plans" onRetry={plans.reload} />
  }
  if (!plan) {
    return plans.loading ? (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <Skeleton className="h-[30rem] rounded-[1.5rem]" />
        <Skeleton className="h-[30rem] rounded-[1.5rem]" />
      </div>
    ) : (
      <div className={cn(card, "px-6 py-14 text-center")}>
        <p className="font-semibold">No plans are open right now</p>
        <p className="mt-1 text-sm text-secondary-600">Use the custom rate calculator meanwhile.</p>
      </div>
    )
  }

  const min = Number(plan.minDeposit)
  const max = plan.maxDeposit ? Number(plan.maxDeposit) : min * 20
  const value = amount ?? plan.minDeposit
  const numeric = Number(value)
  const valid = Number.isFinite(numeric) && numeric > 0
  const inRange = valid && numeric >= min && (!plan.maxDeposit || numeric <= max)
  const projection = projectPlan(plan, valid ? numeric : 0)
  const endsOn = new Date(opened + plan.durationDays * DAY_MS)

  // Plan value day by day: principal plus returns paid so far.
  const dailyCents = Math.round(Number(projection.daily) * 100)
  const principalCents = Math.round((valid ? numeric : 0) * 100)
  const points = Array.from({ length: plan.durationDays + 1 }, (_, day) => ({
    date: new Date(opened + day * DAY_MS).toISOString().slice(0, 10),
    value: ((principalCents + dailyCents * day) / 100).toFixed(2),
  }))

  const choose = (next: Plan) => {
    setSlug(next.slug)
    setAmount(next.minDeposit)
  }

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* Inputs */}
        <section aria-labelledby="calc-inputs" className={cn(card, "p-5 sm:p-6")}>
          <h3 id="calc-inputs" className="font-sans text-base font-semibold">
            Choose a plan
          </h3>
          <div role="radiogroup" aria-label="Plan" className="mt-4 grid grid-cols-2 gap-2">
            {list.map((item) => {
              const active = item.slug === plan.slug
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => choose(item)}
                  className={cn(
                    "relative rounded-2xl border p-3 text-left transition-all",
                    focusRing,
                    active ? "border-primary-600 bg-primary-50/70 ring-1 ring-primary-600" : "border-secondary-200 hover:border-primary-300"
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {item.name}
                    {item.isPopular && <Sparkles aria-label="Most popular" className="size-3.5 text-primary-600" />}
                  </span>
                  <span className="mt-0.5 block text-xs text-secondary-500 tabular-nums">
                    {formatPercent(item.dailyReturnPercent)} · {item.durationDays}d
                  </span>
                  {active && <Check aria-hidden className="absolute top-3 right-3 size-4 text-primary-700" />}
                </button>
              )
            })}
          </div>

          <div className="mt-6 space-y-3">
            <Input
              id="calc-amount"
              label="Amount to invest (USD)"
              type="number"
              inputMode="decimal"
              min={plan.minDeposit}
              step="50"
              value={value}
              onChange={(event) => setAmount(event.target.value)}
              error={
                valid && !inRange
                  ? `${plan.name} takes ${formatMoney(plan.minDeposit)}${plan.maxDeposit ? ` to ${formatMoney(plan.maxDeposit)}` : " or more"}.`
                  : undefined
              }
            />
            <input
              type="range"
              aria-label="Amount"
              min={min}
              max={max}
              step={Math.max(1, Math.round((max - min) / 200))}
              value={Math.min(Math.max(valid ? numeric : min, min), max)}
              onChange={(event) => setAmount(Number(event.target.value).toFixed(2))}
              className="w-full accent-primary-700"
            />
            <div className="flex justify-between text-[11px] text-secondary-500 tabular-nums">
              <span>{formatMoney(plan.minDeposit)}</span>
              <span>{plan.maxDeposit ? formatMoney(plan.maxDeposit) : `${formatMoney(String(max))}+`}</span>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-secondary-200 text-sm">
            {[
              ["Daily rate", formatPercent(plan.dailyReturnPercent)],
              ["Term", `${plan.durationDays} days`],
              ["Over the term", formatPercent(projection.termPercent)],
              ["Paid", "Every 24h"],
            ].map(([label, text]) => (
              <div key={label} className="bg-white px-3 py-2.5">
                <dt className="text-[11px] text-secondary-500">{label}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Result */}
        <section
          aria-labelledby="calc-result"
          className="relative isolate min-w-0 overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-5 text-white shadow-xl shadow-primary-900/15 sm:p-7"
        >
          <div aria-hidden className="pointer-events-none absolute -top-28 -right-24 -z-10 size-80 rounded-full bg-sky-400/15 blur-3xl" />
          <h3 id="calc-result" className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">
            {plan.name} · {formatMoney(valid ? value : "0")}
          </h3>

          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-primary-100">You earn each day</p>
              <p className="mt-1 font-heading text-3xl font-medium tracking-tight text-emerald-200 tabular-nums">
                {formatMoney(projection.daily, { showPlus: true })}
              </p>
            </div>
            <div>
              <p className="text-xs text-primary-100">Returns over {plan.durationDays} days</p>
              <p className="mt-1 font-heading text-3xl font-medium tracking-tight text-emerald-200 tabular-nums">
                {formatMoney(projection.returns, { showPlus: true })}
              </p>
            </div>
            <div>
              <p className="text-xs text-primary-100">Paid back by {formatDate(endsOn)}</p>
              <p className="mt-1 font-heading text-3xl font-medium tracking-tight tabular-nums">
                {formatMoney(projection.atMaturity)}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <AreaChart points={points} tone="inverse" height={200} />
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-primary-100">
              Principal {formatMoney(valid ? value : "0")} + returns {formatMoney(projection.returns)}
            </p>
            <Button asChild variant="inverse" className={cn(!inRange && "pointer-events-none opacity-50")}>
              <Link
                href={inRange ? `/plans?plan=${encodeURIComponent(plan.slug)}&amount=${encodeURIComponent(numeric.toFixed(2))}` : "/plans"}
                aria-disabled={!inRange}
              >
                Start {plan.name} with {formatMoney(valid ? value : "0")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </div>

      {/* Compare */}
      <section aria-labelledby="compare-title" className={cn(card, "overflow-hidden")}>
        <div className="border-b border-secondary-200 px-5 py-4">
          <h3 id="compare-title" className="font-sans text-base font-semibold">
            Every plan at {formatMoney(valid ? value : "0")}
          </h3>
          <p className="text-xs text-secondary-500">Plans this amount doesn&apos;t fit are shown faded.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-secondary-500">
                <th scope="col" className="px-5 py-3 font-medium">Plan</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Daily</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Term</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Returns</th>
                <th scope="col" className="px-5 py-3 text-right font-medium">Paid back</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-100">
              {list.map((item) => {
                const fits =
                  valid &&
                  numeric >= Number(item.minDeposit) &&
                  (!item.maxDeposit || numeric <= Number(item.maxDeposit))
                const row = projectPlan(item, valid ? numeric : 0)
                const current = item.slug === plan.slug
                return (
                  <tr
                    key={item.id}
                    className={cn(current && "bg-primary-50/60", !fits && "text-secondary-400")}
                  >
                    <th scope="row" className="px-5 py-3 text-left font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setSlug(item.slug)
                          if (!fits) setAmount(item.minDeposit)
                        }}
                        className={cn("rounded-md text-left hover:text-primary-700", focusRing)}
                      >
                        {item.name}
                        {!fits && (
                          <span className="ml-2 text-xs font-normal">
                            from {formatMoney(item.minDeposit)}
                          </span>
                        )}
                      </button>
                    </th>
                    <td className="px-5 py-3 text-right tabular-nums">{formatPercent(item.dailyReturnPercent)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{item.durationDays} days</td>
                    <td className={cn("px-5 py-3 text-right font-semibold tabular-nums", fits && "text-emerald-600")}>
                      {fits ? formatMoney(row.returns, { showPlus: true }) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">
                      {fits ? formatMoney(row.atMaturity) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Note>
        Figures use each plan&apos;s stated daily rate and are calculated the same way returns are
        paid: a fixed amount each day, not reinvested. The principal is returned at the end of the
        term.
      </Note>
    </div>
  )
}

/* ------------------------------------------------------------- custom rate */

function CustomCalculator() {
  const [principal, setPrincipal] = useState("5000")
  const [dailyRate, setDailyRate] = useState("1.2")
  const [days, setDays] = useState("30")
  const [compound, setCompound] = useState(false)
  const [opened] = useState(() => Date.now())

  const result = useMemo(() => {
    const start = Number(principal)
    const rate = Number(dailyRate) / 100
    const term = Math.floor(Number(days))
    if (!Number.isFinite(start) || !Number.isFinite(rate) || !Number.isFinite(term) || start <= 0 || rate < 0 || term <= 0 || term > 3650) {
      return null
    }

    const points: Array<{ date: string; value: string }> = []
    let balance = start
    for (let day = 0; day <= term; day += 1) {
      if (day > 0) balance = compound ? balance * (1 + rate) : start + start * rate * day
      points.push({ date: new Date(opened + day * DAY_MS).toISOString().slice(0, 10), value: balance.toFixed(2) })
    }

    return {
      points,
      final: balance.toFixed(2),
      profit: (balance - start).toFixed(2),
      multiple: (balance / start).toFixed(2),
    }
  }, [principal, dailyRate, days, compound, opened])

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section aria-labelledby="custom-inputs" className={cn(card, "space-y-4 p-5 sm:p-6")}>
          <h3 id="custom-inputs" className="font-sans text-base font-semibold">
            Your figures
          </h3>
          <Input id="calc-principal" label="Starting amount (USD)" type="number" inputMode="decimal" min="0" step="100" value={principal} onChange={(event) => setPrincipal(event.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input id="calc-rate" label="Daily rate (%)" type="number" inputMode="decimal" min="0" step="0.1" value={dailyRate} onChange={(event) => setDailyRate(event.target.value)} />
            <Input id="calc-days" label="Days" type="number" inputMode="numeric" min="1" max="3650" step="1" value={days} onChange={(event) => setDays(event.target.value)} />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-secondary-700">How returns are handled</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: false, label: "Paid out", note: "Simple, like our plans" },
                { value: true, label: "Reinvested", note: "Compound, hypothetical" },
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={compound === option.value}
                  onClick={() => setCompound(option.value)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-all",
                    focusRing,
                    compound === option.value ? "border-primary-600 bg-primary-50/70 ring-1 ring-primary-600" : "border-secondary-200 hover:border-primary-300"
                  )}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-xs text-secondary-500">{option.note}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="custom-result" className={cn(card, "min-w-0 p-5 sm:p-7")}>
          <h3 id="custom-result" className="sr-only">Projection</h3>
          {result ? (
            <>
              <div className="grid gap-5 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-secondary-500">Final value</p>
                  <p className="mt-1 font-heading text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(result.final)}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Gain</p>
                  <p className="mt-1 font-heading text-3xl font-semibold tracking-tight text-emerald-600 tabular-nums">{formatMoney(result.profit, { showPlus: true })}</p>
                </div>
                <div>
                  <p className="text-xs text-secondary-500">Multiple</p>
                  <p className="mt-1 font-heading text-3xl font-semibold tracking-tight tabular-nums">{result.multiple}×</p>
                </div>
              </div>
              <div className="mt-6">
                <AreaChart points={result.points} height={220} />
              </div>
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <CalculatorIcon aria-hidden className="mb-3 size-6 text-secondary-400" />
              <p className="font-semibold">Enter your figures</p>
              <p className="mt-1 text-sm text-secondary-600">A positive amount and rate, for up to 10 years.</p>
            </div>
          )}
        </section>
      </div>

      <Note>
        A projection at a constant rate, not a forecast, an offer or a guarantee.
        {compound && " Reinvesting is shown for comparison only: plans pay their returns out daily."}{" "}
        This calculator does not read or change your account.
      </Note>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-secondary-200 bg-white p-4 text-xs leading-relaxed text-secondary-600">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-600" />
      <span>{children}</span>
    </p>
  )
}
