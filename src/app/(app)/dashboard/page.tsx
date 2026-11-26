import type { Metadata } from "next"
import { company } from "@/lib/site"

import { DashboardScreen } from "@/components/dashboard/dashboard-screen"

export const metadata: Metadata = {
  title: "Dashboard",
  description: `Your ${company.name} balances, performance, and activity.`,
  robots: { index: false, follow: false },
}

export default function DashboardPage() {
  return <DashboardScreen />
}
