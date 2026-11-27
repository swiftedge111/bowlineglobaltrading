"use client"

import { useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

import theme from "@/app/bowline-theme.module.css"

import { MobileTabBar } from "@/components/app/mobile-tab-bar"
import { RequireAuth } from "@/components/app/require-auth"
import { Sidebar } from "@/components/app/sidebar"
import { Topbar } from "@/components/app/topbar"
import { adminNav, titleForPath, userNav } from "@/lib/app-nav"
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  toggleCollapsed,
} from "@/lib/sidebar-preference"
import { cn } from "@/lib/utils"

/**
 * The signed-in chrome: a white sidebar, a tinted content column, and the topbar.
 *
 * Uses the Bowline theme, like the marketing and auth screens. Anything Radix
 * portals to <body> (dialogs, menus, sheets) sits outside this tree and has to
 * carry `theme.bowline` itself, or it falls back to the default palette.
 *
 * Both the user app and the admin panel render through this — they differ only
 * in the nav they pass and the role badge, so there is one shell to keep
 * responsive rather than two that drift apart. Below `lg` the sidebar gives way
 * to a bottom tab bar in both.
 */
export function AppShell({
  variant,
  children,
}: {
  /**
   * A string rather than the nav array itself: the layouts that render this are
   * Server Components, and each item carries a Lucide icon — a function, which
   * cannot cross the server/client boundary. Only the variant travels; the nav
   * is resolved here, on the client.
   */
  variant: "user" | "admin"
  children: React.ReactNode
}) {
  const adminOnly = variant === "admin"
  const items = adminOnly ? adminNav : userNav
  const pathname = usePathname()
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )

  const title = titleForPath(pathname, items)

  return (
    <RequireAuth adminOnly={adminOnly}>
      <div
        className={cn(
          theme.bowline,
          "flex min-h-screen bg-secondary-50 text-secondary-900"
        )}
      >
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden shrink-0 transition-[width] duration-200 lg:block",
            collapsed ? "w-[4.5rem]" : "w-64"
          )}
        >
          <Sidebar items={items} collapsed={collapsed} isAdmin={adminOnly} />
        </aside>

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col transition-[padding] duration-200",
            collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"
          )}
        >
          <Topbar
            title={title}
            // Both panels navigate by the bottom tab bar on small screens.
            homeHref={adminOnly ? "/admin" : "/dashboard"}
            collapsed={collapsed}
            onToggleSidebar={toggleCollapsed}
          />
          <main
            className={cn(
              "flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
              // Room for the tab bar and the home indicator beneath it.
              "pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-8"
            )}
          >
            {children}
          </main>
          <MobileTabBar variant={variant} />
        </div>
      </div>
    </RequireAuth>
  )
}
