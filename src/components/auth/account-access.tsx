import Image from "next/image"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { Logo } from "@/components/logo"
import { company } from "@/lib/site"
import { cn } from "@/lib/utils"

const screens = {
  login: {
    title: "Welcome",
    accent: "back.",
    description: "Sign in to view your portfolio and account activity.",
    artwork: "auth-login-panel-v2",
    artworkTitle: "Your portfolio, in view.",
    artworkDescription: "See your holdings, available balance, and recent activity from your account.",
    artworkCaption: "Illustrative portfolio",
  },
  signup: {
    title: "Create your",
    accent: "account.",
    description: "After signup, we’ll guide you through setting up your Bowline account.",
    artwork: "auth-signup-panel-v2",
    artworkTitle: "Get to know the markets.",
    artworkDescription: "Follow forex, cryptocurrencies, stocks, and commodities in Market Watch.",
    artworkCaption: "Illustrative market watchlist",
  },
} as const

const links = [
  { mode: "login", href: "/login", label: "Sign in" },
  { mode: "signup", href: "/signup", label: "Create account" },
] as const

const switchLinkClass = "flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold"

export function AccountAccess({
  mode,
  children,
}: {
  mode: keyof typeof screens
  children: React.ReactNode
}) {
  const screen = screens[mode]

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
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-secondary-700 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-700"
          >
            <ArrowLeft aria-hidden className="size-4" /> Back to site
          </Link>
        </div>
      </header>

      <div className="container-px flex flex-1 items-center justify-center py-6 sm:py-9 lg:py-11">
        <div className="grid w-full max-w-lg items-center gap-7 lg:items-stretch lg:max-w-7xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:gap-10">
          <section
            aria-labelledby="account-access-title"
            className="min-w-0 rounded-[1.5rem] border border-secondary-200 bg-white p-5 shadow-sm sm:p-8 lg:col-start-2 lg:row-start-1 lg:p-9"
          >
            <nav aria-label="Account access" className="grid max-w-xs grid-cols-2 gap-1 rounded-xl border border-secondary-200 bg-secondary-50 p-1">
              {links.map((link) => link.mode === mode ? (
                <span key={link.mode} aria-current="page" className={cn(switchLinkClass, "bg-primary-700 text-white")}>
                  {link.label}
                </span>
              ) : (
                <Link
                  key={link.mode}
                  href={link.href}
                  className={cn(switchLinkClass, "text-secondary-700 hover:bg-white hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-700")}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <h1 id="account-access-title" className="mt-6 text-4xl leading-[1.05] font-semibold tracking-[-0.055em] sm:text-5xl">
              {screen.title} <span className="inline-block font-serif font-normal text-primary-600 italic">{screen.accent}</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-secondary-600 sm:text-base">{screen.description}</p>
            <div className="mt-6 [&_input:not([type=checkbox])]:text-base">
              {children}
            </div>
          </section>

          <figure className="relative hidden min-h-[34rem] min-w-0 overflow-hidden rounded-[1.5rem] bg-linear-to-br from-primary-900 to-primary-950 lg:col-start-1 lg:row-start-1 lg:block xl:min-h-[38rem]">
            <Image
              src={`/images/sections/${screen.artwork}.png`}
              alt={`${screen.artworkTitle} ${screen.artworkDescription}`}
              fill
              sizes="(min-width: 1280px) 650px, (min-width: 1024px) 48vw, 0px"
              className="object-contain"
            />
          </figure>
        </div>
      </div>
    </div>
  )
}
