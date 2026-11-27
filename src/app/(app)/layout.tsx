import type { Viewport } from "next"

import { AppShell } from "@/components/app/app-shell"

/**
 * `cover` lets the page draw under the iPhone home indicator, so the bottom tab
 * bar can pad itself with `env(safe-area-inset-bottom)` and sit clear of it.
 */
export const viewport: Viewport = { viewportFit: "cover" }

/**
 * Every signed-in user page renders inside the shell.
 *
 * `/welcome` deliberately sits outside this group: onboarding is a one-time
 * full-page moment, and framing it with the nav it is introducing undercuts it.
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <AppShell variant="user">{children}</AppShell>
}
