import type { Metadata } from "next"

import { PlansScreen } from "@/components/plans/plans-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Investment Plans",
  description: "Compare investment plans by minimum deposit and term, and review the plans you already hold.",
  path: "/plans",
  robots: { index: false, follow: false },
})

export default function PlansPage() {
  return <PlansScreen />
}
