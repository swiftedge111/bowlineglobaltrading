import type { Metadata } from "next"

import { CalculatorScreen } from "@/components/calculator/calculator-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Calculator",
  description: "Estimate projected returns using an amount, a daily rate, and a plan term.",
  path: "/calculator",
  robots: { index: false, follow: false },
})

export default function CalculatorPage() {
  return <CalculatorScreen />
}
