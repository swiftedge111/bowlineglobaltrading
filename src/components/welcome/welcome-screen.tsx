"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import {
  ArrowRight,
  Check,
  Headphones,
  LayoutDashboard,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { Logo } from "@/components/logo"
import { useAuth } from "@/components/providers/auth-provider"
import * as api from "@/lib/api/endpoints"
import type { Plan } from "@/lib/api/types"
import { formatMoney, formatPercent, isZero } from "@/lib/format"
import { hasOnboarded, markOnboarded } from "@/lib/onboarding"
import { company, supportContact } from "@/lib/site"
import { cn } from "@/lib/utils"

/**
 * First-run checklist driven by the current account state.
 *
 * Uses the same Bowline theme as the marketing and auth screens: the welcome
 * page is the hand-off between them and the app, so it should read as the
 * last page of signup, not the first page of something else.
 */

interface Step {
  key: string
  title: string
  description: string
  doneDescription: string
  href: string
  cta: string
  icon: LucideIcon
  done: boolean
}

const ease = [0.16, 1, 0.3, 1] as const

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"

export function WelcomeScreen() {
  const { user } = useAuth()
  const router = useRouter()

  const [funded, setFunded] = useState<boolean | null>(null)
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [balance, setBalance] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[] | null>(null)

  // Onboarding is a one-time moment. Anyone who has already been through it and
  // lands here again — a stale tab, the back button, a bookmarked URL — goes
  // straight to the dashboard rather than being asked to start over.
  useEffect(() => {
    if (user && hasOnboarded(user.id)) {
      router.replace("/dashboard")
    }
  }, [user, router])

  useEffect(() => {
    let cancelled = false

    // Each check stands alone: a failing plans call must not blank the balance.
    void api.portfolio
      .summary()
      .then((summary) => {
        if (cancelled) return
        setBalance(summary.balance)
        setFunded(!isZero(summary.balance))
      })
      .catch(() => {
        if (!cancelled) setFunded(false)
      })

    void api.subscriptions
      .list()
      .then(({ subscriptions }) => {
        if (!cancelled) setSubscribed(subscriptions.length > 0)
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false)
      })

    void api.plans
      .list()
      .then(({ plans }) => {
        if (!cancelled) setPlans(plans)
      })
      .catch(() => {
        if (!cancelled) setPlans([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  const firstName = user?.fullName.trim().split(/\s+/)[0] ?? "there"

  // Plans are sorted by the API; the cheapest entry point is the first one.
  const entryPlan = plans?.[0]

  const steps: Step[] = [
    {
      key: "fund",
      title: "Fund your account",
      description:
        "Add funds by bank transfer, crypto or digital wallet. Your deposit is credited once our team confirms it.",
      doneDescription: "Your account has funds. You can add more at any time.",
      href: "/deposit",
      cta: "Make a deposit",
      icon: Wallet,
      done: funded === true,
    },
    {
      key: "plan",
      title: "Choose an investment plan",
      description: entryPlan
        ? `${plans!.length} plans, from ${entryPlan.name} at ${formatMoney(entryPlan.minDeposit)}. Each states its daily return and term up front.`
        : "Each plan states its daily return, term and minimum up front.",
      doneDescription: "Your plan is running. Track its returns from the dashboard.",
      href: "/plans",
      cta: "Compare plans",
      icon: TrendingUp,
      done: subscribed === true,
    },
    {
      key: "secure",
      title: "Secure your account",
      description:
        "Add a phone number so we can reach you about withdrawals, and check your password is one you use nowhere else.",
      doneDescription:
        "Your phone number is on file. Review your password and contact details in settings.",
      href: "/settings",
      cta: "Open settings",
      icon: ShieldCheck,
      done: Boolean(user?.phone),
    },
  ]

  const completed = steps.filter((step) => step.done).length
  const nextKey = steps.find((step) => !step.done)?.key
  const progress = Math.round((completed / steps.length) * 100)

  const finish = (destination: string) => {
    if (user) markOnboarded(user.id)
    router.push(destination)
  }

  return (
    <div
      className={cn(
        theme.bowline,
        "flex min-h-svh flex-col bg-secondary-50 text-secondary-900"
      )}
    >
      <header className="border-b border-secondary-200 bg-white">
        <div className="container-px flex min-h-18 items-center justify-between gap-4 py-2.5 sm:min-h-20">
          <Link
            href="/"
            aria-label={`${company.name} home`}
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700"
          >
            <Logo className="w-36 min-[360px]:w-40 sm:w-48" />
          </Link>
          <button
            type="button"
            onClick={() => finish("/dashboard")}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-secondary-700 hover:text-primary-700",
              focusRing
            )}
          >
            Skip for now <ArrowRight aria-hidden className="size-4" />
          </button>
        </div>
      </header>

      <main className="container-px flex-1 py-6 sm:py-9 lg:py-11">
        <div className="mx-auto grid max-w-lg gap-6 lg:max-w-7xl lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-8 xl:gap-10">
          {/* Checklist */}
          <motion.section
            aria-labelledby="welcome-title"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease }}
            className="min-w-0 rounded-[1.5rem] border border-secondary-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10"
          >
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 py-1 pr-3 pl-2 text-xs font-semibold text-emerald-800">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              Account opened
            </p>

            <h1
              id="welcome-title"
              className="mt-5 text-4xl leading-[1.05] font-semibold tracking-[-0.055em] text-balance sm:text-5xl"
            >
              Welcome aboard,{" "}
              <span className="inline-block font-serif font-normal text-primary-600 italic">
                {firstName}.
              </span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-secondary-600 sm:text-base">
              Your {company.name} account is live. Finish these three steps and
              you&apos;ll be ready to take your first position.
            </p>

            {/* Progress */}
            <div className="mt-7 rounded-2xl border border-secondary-200 bg-secondary-50 p-4 sm:p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-semibold">Setup progress</p>
                <p className="text-sm text-secondary-600 tabular-nums">
                  <span className="font-semibold text-secondary-900">{completed}</span> of{" "}
                  {steps.length} complete
                </p>
              </div>
              <div
                role="progressbar"
                aria-label="Setup progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                className="mt-3 h-2 overflow-hidden rounded-full bg-secondary-200"
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, delay: 0.2, ease }}
                  className="h-full rounded-full bg-linear-to-r from-primary-500 to-primary-700"
                />
              </div>
            </div>

            <ol className="mt-6 space-y-3">
              {steps.map((step, index) => (
                <motion.li
                  key={step.key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.12 + index * 0.07, ease }}
                >
                  <StepRow step={step} index={index} isNext={step.key === nextKey} />
                </motion.li>
              ))}
            </ol>

            <div className="mt-8 flex flex-col gap-4 border-t border-secondary-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <Button size="lg" onClick={() => finish("/dashboard")}>
                <LayoutDashboard aria-hidden />
                Go to dashboard
                <ArrowRight
                  aria-hidden
                  className="transition-transform group-hover/button:translate-x-0.5"
                />
              </Button>

              {supportContact && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-secondary-600">
                  <Headphones aria-hidden className="size-4 shrink-0 text-primary-600" />
                  Need a hand?{" "}
                  <a
                    href={supportContact.href}
                    className="rounded-sm font-semibold text-primary-700 underline decoration-primary-200 underline-offset-4 hover:decoration-primary-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
                  >
                    {supportContact.label}
                  </a>
                </p>
              )}
            </div>
          </motion.section>

          {/* Account panel */}
          <motion.aside
            aria-label="Your account"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease }}
            className="relative min-w-0 overflow-hidden rounded-[1.5rem] bg-linear-to-br from-primary-900 via-primary-800 to-primary-950 p-5 text-white sm:p-8 xl:p-9"
          >
            <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-sky-400/20 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-24 size-80 rounded-full bg-primary-400/20 blur-3xl" />

            <div className="relative flex h-full flex-col">
              <p className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">
                Your account
              </p>

              {/* Account card */}
              <div className="mt-4 rounded-2xl border border-white/15 bg-white/[0.07] p-5 shadow-lg shadow-primary-950/30 backdrop-blur-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-primary-100">Account holder</p>
                    <p className="mt-0.5 truncate text-sm font-semibold">
                      {user?.fullName ?? "—"}
                    </p>
                  </div>
                  <Logo showWordmark={false} invert className="size-8 opacity-90" />
                </div>

                <p className="mt-6 text-xs text-primary-100">Balance · USD</p>
                <p className="mt-1 font-heading text-4xl font-medium tracking-tight tabular-nums">
                  {balance === null ? (
                    <span className="inline-block h-9 w-40 animate-pulse rounded-lg bg-white/10 align-middle" />
                  ) : (
                    formatMoney(balance)
                  )}
                </p>

                <div className="mt-6 flex items-end justify-between gap-3 border-t border-white/15 pt-4">
                  <div className="min-w-0">
                    <p className="text-xs text-primary-100">Account ID</p>
                    <p className="mt-0.5 font-mono text-sm font-semibold tracking-wider">
                      {user?.uid ?? "—"}
                    </p>
                  </div>
                  {user?.uid && (
                    <CopyButton
                      value={user.uid}
                      label="Copy your account ID"
                      variant="inline"
                      className="bg-white/10 text-white hover:bg-white/20 hover:text-white focus-visible:ring-white/60"
                    />
                  )}
                </div>
              </div>

              {/* Plans */}
              <div className="mt-8">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-sans text-sm font-semibold">Investment plans</h2>
                  <Link
                    href="/plans"
                    className="inline-flex min-h-9 items-center gap-1 rounded-sm text-xs font-semibold text-sky-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Compare <ArrowRight aria-hidden className="size-3.5" />
                  </Link>
                </div>

                <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                  {plans === null
                    ? Array.from({ length: 4 }, (_, i) => (
                        <li key={i} className="flex items-center justify-between px-4 py-3">
                          <span className="h-4 w-20 animate-pulse rounded bg-white/10" />
                          <span className="h-4 w-14 animate-pulse rounded bg-white/10" />
                        </li>
                      ))
                    : plans.map((plan) => (
                        <li key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                              {plan.name}
                              {plan.isPopular && (
                                <span className="rounded-full bg-sky-300/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-200 uppercase">
                                  Popular
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-primary-100 tabular-nums">
                              From {formatMoney(plan.minDeposit)} · {plan.durationDays} days
                            </p>
                          </div>
                          <p className="shrink-0 text-right tabular-nums">
                            <span className="block text-sm font-semibold text-emerald-200">
                              {formatPercent(plan.dailyReturnPercent)}
                            </span>
                            <span className="block text-[11px] text-primary-100">daily</span>
                          </p>
                        </li>
                      ))}
                  {plans?.length === 0 && (
                    <li className="px-4 py-3 text-sm text-primary-100">
                      No plans are open right now. Check back soon.
                    </li>
                  )}
                </ul>
              </div>

              <div className="mt-8 flex items-center gap-3 border-t border-white/15 pt-6 text-sm text-primary-100 lg:mt-auto">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <ShieldCheck aria-hidden className="size-4 text-sky-200" />
                </span>
                Deposits are credited only after our team confirms them.
              </div>
            </div>
          </motion.aside>
        </div>
      </main>
    </div>
  )
}

function StepRow({
  step,
  index,
  isNext,
}: {
  step: Step
  index: number
  isNext: boolean
}) {
  const Icon = step.icon

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 rounded-2xl border p-4 transition-colors sm:flex-row sm:items-center sm:p-5",
        step.done
          ? "border-emerald-200 bg-emerald-50/50"
          : isNext
            ? "border-primary-300 bg-primary-50/50 ring-4 ring-primary-50"
            : "border-secondary-200 bg-white hover:border-primary-200"
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          step.done
            ? "bg-emerald-100 text-emerald-700"
            : isNext
              ? "bg-primary-600 text-white shadow-md shadow-primary-600/25"
              : "bg-secondary-100 text-secondary-600"
        )}
      >
        {step.done ? (
          <Check aria-hidden className="size-5" strokeWidth={3} />
        ) : (
          <Icon aria-hidden className="size-5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-base font-semibold">
          <span className="text-xs font-semibold text-secondary-400 tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          {step.title}
          {step.done ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
              Done
            </span>
          ) : isNext ? (
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-800">
              Up next
            </span>
          ) : null}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-secondary-600">
          {step.done ? step.doneDescription : step.description}
        </p>
      </div>

      {/* A completed step still links out: "Review" rather than a dead end. */}
      <Button
        asChild
        size="sm"
        variant={step.done ? "ghost" : isNext ? "default" : "outline"}
        className={cn(
          "shrink-0 self-start sm:self-center",
          !step.done && !isNext && "border border-secondary-300 text-secondary-800 hover:border-primary-300 hover:bg-white hover:text-primary-700"
        )}
      >
        <Link href={step.href}>
          {step.done ? "Review" : step.cta}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  )
}
