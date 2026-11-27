import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  CandlestickChart,
  Coins,
  CreditCard,
  KeyRound,
  Layers,
  LayoutDashboard,
  ReceiptText,
  ScrollText,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import { company } from "@/lib/site"

/**
 * The signed-in navigation, shared by the user app and the admin panel so both
 * render through the same shell. Order here is the order on screen.
 */

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /**
   * Match this route only, never its descendants. Needed for index routes like
   * `/admin`, which is a prefix of every other admin page and would otherwise
   * light up alongside whichever one you were actually on.
   */
  exact?: boolean
}

export const userNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/markets", label: "Markets", icon: CandlestickChart },
  { href: "/plans", label: "Investment plans", icon: Coins },
  { href: "/deposit", label: "Deposit", icon: ArrowDownToLine },
  { href: "/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/settings", label: "Settings", icon: Settings },
]

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
  { href: "/admin/plans", label: "Investment plans", icon: Coins },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Layers },
  { href: "/admin/pins", label: "Withdrawal PINs", icon: KeyRound },
  { href: "/admin/payment-methods", label: "Payment methods", icon: CreditCard },
  { href: "/admin/audit-logs", label: "Audit log", icon: ScrollText },
]

/**
 * Titles for routes that have no sidebar entry of their own — a detail page
 * still needs a heading in the topbar.
 */
const extraTitles: Record<string, string> = {
  "/welcome": "Welcome",
  "/wallet": "Wallet",
}

/**
 * The client app's bottom tab bar on phones and small tablets.
 *
 * A finance app is used for the same few things again and again, so those sit
 * one thumb-tap away. Everything else lives under More. `match` lists every
 * route that lights a tab, so Deposit and Withdraw keep Wallet active.
 */
export interface MobileTab {
  href: string
  label: string
  icon: LucideIcon
  match: string[]
  /** Light only on `match` itself, never below it — for an index like `/admin`. */
  exact?: boolean
}

export const mobileTabs: MobileTab[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, match: ["/dashboard"] },
  { href: "/markets", label: "Markets", icon: CandlestickChart, match: ["/markets"] },
  { href: "/plans", label: "Plans", icon: Coins, match: ["/plans"] },
  { href: "/wallet", label: "Wallet", icon: Wallet, match: ["/wallet", "/deposit", "/withdraw"] },
]

/** Under the More tab. */
export const moreLinks: NavItem[] = [
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/calculator", label: "Calculator", icon: Calculator },
  { href: "/settings", label: "Settings", icon: Settings },
]

/**
 * The admin panel on a phone is mostly about clearing the two review queues,
 * so they get tabs of their own (with live counts) beside Overview and Users.
 */
export const adminMobileTabs: MobileTab[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, match: ["/admin"], exact: true },
  { href: "/admin/deposits", label: "Deposits", icon: ArrowDownToLine, match: ["/admin/deposits"] },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine, match: ["/admin/withdrawals"] },
  { href: "/admin/users", label: "Users", icon: Users, match: ["/admin/users"] },
]

export const adminMoreLinks: NavItem[] = [
  { href: "/admin/plans", label: "Investment plans", icon: Coins },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: Layers },
  { href: "/admin/pins", label: "Withdrawal PINs", icon: KeyRound },
  { href: "/admin/payment-methods", label: "Payment methods", icon: CreditCard },
  { href: "/admin/audit-logs", label: "Audit log", icon: ScrollText },
]

export function isTabActive(pathname: string, tab: MobileTab): boolean {
  return tab.exact ? tab.match.includes(pathname) : matchesAny(pathname, tab.match)
}

export function matchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((href) => pathname === href || pathname.startsWith(`${href}/`))
}

/** Active when it is the route, or — unless `exact` — an ancestor of it. */
export function isActivePath(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true
  if (item.exact) return false
  // Compare on a segment boundary so `/deposit` cannot claim `/deposits-archive`.
  return pathname.startsWith(`${item.href}/`)
}

/**
 * The longest matching prefix wins, so `/admin/users/A4F291` is titled by
 * `/admin/users` rather than by `/admin`.
 */
export function titleForPath(pathname: string, items: NavItem[]): string {
  const known = extraTitles[pathname]
  if (known) return known

  const match = items
    .filter((item) => isActivePath(pathname, item))
    .sort((a, b) => b.href.length - a.href.length)[0]

  return match?.label ?? company.name
}
