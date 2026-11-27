"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Dialog } from "radix-ui"
import { ChevronRight, Headphones, LogOut, MoreHorizontal, ShieldCheck, X } from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { useAuth } from "@/components/providers/auth-provider"
import { CopyButton } from "@/components/ui/copy-button"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import {
  adminMobileTabs,
  adminMoreLinks,
  isTabActive,
  matchesAny,
  mobileTabs,
  moreLinks,
  type NavItem,
} from "@/lib/app-nav"
import { initials } from "@/lib/format"
import { supportContact } from "@/lib/site"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/**
 * Bottom navigation for the client app below the desktop breakpoint.
 *
 * It replaces the hamburger there: the screens people use most are always in
 * view and within thumb reach. The bar clears the iPhone home indicator with
 * `env(safe-area-inset-bottom)`, which needs `viewport-fit=cover` (set in the
 * signed-in layouts).
 *
 * The admin variant swaps in its own tabs and puts a live count on the two
 * review queues. Counts reload on every navigation, so approving a deposit and
 * moving on updates the badge without a timer.
 */
export function MobileTabBar({ variant = "user" }: { variant?: "user" | "admin" }) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const admin = variant === "admin"
  const tabs = admin ? adminMobileTabs : mobileTabs
  const links = admin ? adminMoreLinks : moreLinks
  const moreActive = matchesAny(pathname, links.map((link) => link.href))
  const counts = useQueueCounts(admin, pathname)

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-secondary-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(9,39,57,0.18)] backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
          {tabs.map((tab) => {
            const active = isTabActive(pathname, tab)
            const count = counts[tab.href] ?? 0
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className="group flex h-full flex-col items-center justify-center gap-1 outline-none"
                >
                  <TabIcon active={active}>
                    <tab.icon aria-hidden className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                    {count > 0 && (
                      <span className="absolute -top-1 right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-white tabular-nums">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </TabIcon>
                  <span className={cn("max-w-full truncate px-0.5 text-[11px] font-semibold", active ? "text-primary-700" : "text-secondary-500")}>
                    {tab.label}
                    {count > 0 && <span className="sr-only">, {count} waiting</span>}
                  </span>
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="group flex h-full w-full flex-col items-center justify-center gap-1 outline-none"
            >
              <TabIcon active={moreActive || moreOpen}>
                <MoreHorizontal aria-hidden className="size-5" strokeWidth={moreActive ? 2.25 : 1.75} />
              </TabIcon>
              <span className={cn("text-[11px] font-semibold", moreActive || moreOpen ? "text-primary-700" : "text-secondary-500")}>
                More
              </span>
            </button>
          </li>
        </ul>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} links={links} admin={admin} />
    </>
  )
}

/** Pending review counts keyed by tab href; empty for clients or until loaded. */
function useQueueCounts(admin: boolean, pathname: string): Record<string, number> {
  const stats = useAsyncData(
    () => (admin ? api.admin.stats() : Promise.resolve(null)),
    admin ? `tab-counts:${pathname}` : "tab-counts:none"
  )
  const queues = stats.data?.queues
  if (!queues) return {}
  return {
    "/admin/deposits": queues.pendingDeposits,
    "/admin/withdrawals": queues.pendingWithdrawals,
  }
}

function TabIcon({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "relative grid h-7 w-12 place-items-center rounded-full transition-colors group-focus-visible:ring-4 group-focus-visible:ring-primary-200",
        active ? "bg-primary-50 text-primary-700" : "text-secondary-500 group-active:bg-secondary-100"
      )}
    >
      {children}
    </span>
  )
}

function MoreSheet({
  open,
  onOpenChange,
  links,
  admin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  links: NavItem[]
  admin: boolean
}) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await logout()
    } catch {
      toast.error("Signed out on this device, but the server did not confirm.")
    } finally {
      onOpenChange(false)
      router.replace("/login")
      setSigningOut(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#092739]/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            theme.bowline,
            "fixed inset-x-0 bottom-0 z-50 max-h-[85svh] overflow-y-auto rounded-t-[1.75rem] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] text-secondary-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom lg:hidden"
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-secondary-200" />

          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <Dialog.Title className="text-base font-semibold">More</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid size-9 place-items-center rounded-lg text-secondary-500 outline-none hover:bg-secondary-100 focus-visible:ring-4 focus-visible:ring-primary-200"
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          {user && (
            <div className="mx-5 flex items-center gap-3 rounded-2xl bg-secondary-50 p-3 ring-1 ring-secondary-200">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary-600 to-primary-800 text-sm font-bold text-white">
                {initials(user.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user.fullName}</p>
                {admin ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-primary-700">
                    <ShieldCheck aria-hidden className="size-3.5" /> Administrator
                  </p>
                ) : (
                  <p className="flex items-center gap-1 text-xs text-secondary-500">
                    ID <span className="font-mono font-semibold text-secondary-800">{user.uid}</span>
                    <CopyButton value={user.uid} label="Copy your account ID" className="p-1" />
                  </p>
                )}
              </div>
            </div>
          )}

          <ul className="mt-3 px-3">
            {links.map((link) => {
              const active = matchesAny(pathname, [link.href])
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => onOpenChange(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-13 items-center gap-3 rounded-xl px-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary-200",
                      active ? "bg-primary-50 text-primary-700" : "text-secondary-800 active:bg-secondary-100"
                    )}
                  >
                    <span className={cn("grid size-9 place-items-center rounded-xl ring-1", active ? "bg-white text-primary-700 ring-primary-200" : "bg-secondary-50 text-secondary-600 ring-secondary-200")}>
                      <link.icon aria-hidden className="size-4.5" />
                    </span>
                    <span className="flex-1">{link.label}</span>
                    <ChevronRight aria-hidden className="size-4 text-secondary-400" />
                  </Link>
                </li>
              )
            })}
            {!admin && supportContact && (
              <li>
                <a
                  href={supportContact.href}
                  className="flex min-h-13 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-secondary-800 outline-none active:bg-secondary-100 focus-visible:ring-4 focus-visible:ring-primary-200"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-secondary-50 text-secondary-600 ring-1 ring-secondary-200">
                    <Headphones aria-hidden className="size-4.5" />
                  </span>
                  <span className="flex-1">Contact support</span>
                  <ChevronRight aria-hidden className="size-4 text-secondary-400" />
                </a>
              </li>
            )}
          </ul>

          <div className="mx-5 mt-3 border-t border-secondary-200 pt-3">
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-red-600 outline-none active:bg-red-50 focus-visible:ring-4 focus-visible:ring-red-100 disabled:opacity-50"
            >
              <LogOut aria-hidden className="size-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
