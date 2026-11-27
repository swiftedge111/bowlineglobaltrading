"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"

import { Section } from "@/components/site/section"
import { Button } from "@/components/ui/button"
import { depositMethods, plans } from "@/lib/site"
import { cn } from "@/lib/utils"

const tickStep = Math.ceil(Math.max(...plans.map((plan) => plan.durationDays)) / 3)
const termTicks = [0, tickStep, tickStep * 2, tickStep * 3]
const termColumns = "grid grid-cols-[5.625rem_minmax(0,1fr)_2.5rem] items-center gap-2 px-2.5 sm:grid-cols-[7rem_minmax(0,1fr)_3.5rem] sm:gap-4 sm:px-4"

export function Plans() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const groupName = useId()
  const plan = plans[selectedIndex]
  const details = [
    { label: "Term", value: `${plan.durationDays} days` },
    { label: "Daily return target", value: plan.dailyReturn },
    { label: "Minimum", value: plan.minDeposit },
    { label: "Maximum", value: plan.maxDeposit },
  ]

  return (
    <Section id="plans" aria-labelledby="plans-title" className="bg-white">
      <h2 id="plans-title" className="text-4xl leading-[1.05] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl xl:text-6xl">
        Investment plans, <span className="inline-block font-serif font-normal text-primary-600 italic">side by side.</span>
      </h2>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.18fr_1fr]">
        <div className="flex min-w-0 items-center rounded-2xl border border-secondary-200 bg-secondary-50 p-4 sm:p-7 xl:p-9">
          <fieldset className="w-full min-w-0" aria-describedby="plan-timeline-hint">
            <legend className="font-heading text-xl font-semibold tracking-tight text-secondary-900 sm:text-2xl">
              How long is each plan?
            </legend>
            <p id="plan-timeline-hint" className="mt-2 text-sm leading-relaxed text-secondary-600">
              Select a plan to see its deposit range and features.
            </p>

            <div aria-hidden className={cn(termColumns, "mt-7 text-xs font-medium tabular-nums text-secondary-500")}>
              <span>Plan</span>
              <div className="flex justify-between">
                {termTicks.map((day) => <span key={day}>{day}</span>)}
              </div>
              <span className="text-right">Days</span>
            </div>

            <div className="mt-2 space-y-2">
              {plans.map((option, index) => (
                <label key={option.name} className="block cursor-pointer">
                  <input
                    type="radio"
                    name={groupName}
                    className="peer sr-only"
                    checked={index === selectedIndex}
                    aria-controls="plan-details"
                    onChange={() => setSelectedIndex(index)}
                  />
                  <span className={cn(termColumns, "min-h-16 rounded-xl border border-secondary-200 bg-white py-2 transition-colors hover:border-primary-300 peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-700")}>
                    <span>
                      <span className="block text-sm font-semibold text-secondary-900 sm:text-base">{option.name}</span>
                      <span className="mt-0.5 block text-xs whitespace-nowrap tabular-nums text-secondary-600">Min. {option.minDeposit}</span>
                    </span>
                    <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-secondary-200">
                      <span
                        className={cn("block h-full rounded-full", index === selectedIndex ? "bg-primary-600" : "bg-secondary-400")}
                        style={{ width: `${option.durationDays / (tickStep * 3) * 100}%` }}
                      />
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-secondary-900">{option.durationDays} <span className="sr-only">days</span></span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <article id="plan-details" aria-labelledby="selected-plan-name" className="flex min-w-0 flex-col rounded-2xl bg-linear-to-br from-secondary-900 to-primary-900 p-5 text-white sm:p-7 xl:p-9">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 id="selected-plan-name" className="text-3xl font-semibold tracking-tight sm:text-4xl">{plan.name}</h3>
            {plan.popular && (
              <span className="rounded-full border border-white/25 px-2.5 py-1 text-xs font-medium text-primary-100">Most popular</span>
            )}
          </div>
          <p className="mt-2.5 max-w-md text-sm leading-relaxed text-primary-100">{plan.description}</p>

          <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/15 bg-white/15">
            {details.map(({ label, value }) => (
              <div key={label} className="bg-secondary-900 px-3 py-2.5 sm:px-4">
                <dt className="text-xs leading-snug text-primary-100">{label}</dt>
                <dd className="mt-1 font-heading text-base font-semibold tabular-nums sm:text-xl">{value}</dd>
              </div>
            ))}
          </dl>

          <ul role="list" aria-label={`Included with ${plan.name}`} className="mt-5 grid flex-1 content-start gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm leading-snug text-white">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-300" />
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <Button asChild variant="inverse">
              <Link href="/signup">Open an account <ArrowRight aria-hidden /></Link>
            </Button>
          </div>
        </article>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-y border-secondary-200 py-5">
        <div>
          <h3 className="text-base font-semibold text-secondary-900">Funding methods</h3>
          <p className="mt-1 text-sm text-secondary-600">Your balance updates once your payment is confirmed.</p>
        </div>
        <ul role="list" className="flex flex-wrap gap-x-5 gap-y-3">
          {depositMethods.map(({ label, icon: Icon }) => (
            <li key={label} className="flex items-center gap-2 text-sm font-medium text-secondary-700">
              <Icon aria-hidden className="size-4 shrink-0 text-primary-700" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-secondary-600">
        Daily return targets are illustrative. Actual returns may vary and you may lose capital.{" "}
        <a href="#risk-disclosure" className="font-medium text-primary-700 underline underline-offset-4">Read the risk disclosure</a>
      </p>
    </Section>
  )
}
