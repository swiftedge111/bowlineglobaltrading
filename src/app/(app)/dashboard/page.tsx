import type { Metadata } from "next"

import { DashboardScreen } from "@/components/dashboard/dashboard-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Dashboard",
  description: "Sign in to see your portfolio balance, performance, and recent activity.",
  path: "/dashboard",
  robots: { index: false, follow: false },
})

export default function DashboardPage() {
  return <DashboardScreen />
}
