import Link from "next/link"
import { ArrowLeft, Check, KeyRound, ShieldCheck } from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { Logo } from "@/components/logo"
import { company } from "@/lib/site"
import { cn } from "@/lib/utils"

interface PasswordRecoveryShellProps {
  title: string
  subtitle: string
  panelTitle: string
  panelDescription: string
  steps: string[]
  children: React.ReactNode
  footer: React.ReactNode
}

export function PasswordRecoveryShell({
  title,
  subtitle,
  panelTitle,
  panelDescription,
  steps,
  children,
  footer,
}: PasswordRecoveryShellProps) {
  return (
    <div className={cn(theme.bowline, "flex min-h-svh flex-col bg-secondary-50 text-secondary-900")}>
      <header className="border-b border-secondary-200 bg-white">
        <div className="container-px flex min-h-18 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 sm:min-h-20">
          <Link
            href="/"
            aria-label={`${company.name} home`}
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-700"
          >
            <Logo className="w-36 min-[360px]:w-40 sm:w-48" />
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-secondary-700 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
          >
            <ArrowLeft aria-hidden className="size-4" /> Back to sign in
          </Link>
        </div>
      </header>

      <div className="container-px flex flex-1 items-center justify-center py-6 sm:py-9 lg:py-11">
        <div className="grid w-full max-w-lg items-center gap-7 lg:items-stretch lg:max-w-7xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:gap-10">
          <section
            aria-labelledby="recovery-title"
            className="min-w-0 rounded-[1.5rem] border border-secondary-200 bg-white p-5 shadow-sm sm:p-8 lg:col-start-2 lg:row-start-1 lg:p-9"
          >
            <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
              <KeyRound aria-hidden className="size-5" />
            </div>
            <h1 id="recovery-title" className="text-4xl leading-[1.05] font-semibold tracking-[-0.055em] sm:text-5xl">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-secondary-600 sm:text-base">{subtitle}</p>
            <div className="mt-7 [&_input:not([type=checkbox])]:text-base">
              {children}
            </div>
            <p className="mt-7 text-center text-sm text-secondary-600">{footer}</p>
          </section>

          <aside className="relative hidden min-w-0 overflow-hidden rounded-[1.5rem] bg-linear-to-br from-primary-900 via-primary-800 to-primary-950 p-8 text-white lg:col-start-1 lg:row-start-1 lg:block xl:p-10">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-sky-400/20 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-24 size-80 rounded-full bg-primary-400/20 blur-3xl" />
            <div className="relative flex h-full flex-col">
              <div className="flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg shadow-blue-950/20 backdrop-blur">
                <ShieldCheck aria-hidden className="size-7 text-sky-200" strokeWidth={1.7} />
              </div>
              <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">Account recovery</p>
              <h2 className="mt-3 max-w-md text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">
                {panelTitle}
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-primary-100 sm:text-base">{panelDescription}</p>

              <ol className="mt-9 space-y-3">
                {steps.map((step, index) => (
                  <li key={step} className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-sky-100">
                      0{index + 1}
                    </span>
                    <span className="text-sm font-medium text-white/90">{step}</span>
                    {index < steps.length - 1 && <Check aria-hidden className="ml-auto size-4 text-sky-200/70" />}
                  </li>
                ))}
              </ol>

              <div className="mt-auto flex items-center gap-3 border-t border-white/15 pt-6 text-sm text-primary-100">
                <span className="flex size-9 items-center justify-center rounded-full bg-white/10">
                  <ShieldCheck aria-hidden className="size-4 text-sky-200" />
                </span>
                Your account details stay private and secure.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
