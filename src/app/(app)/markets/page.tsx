import type { Metadata } from "next"

import { MarketsScreen } from "@/components/markets/markets-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Markets",
  description: "Explore prices and market data across forex, crypto, stocks, indices, and commodities.",
  path: "/markets",
  robots: { index: false, follow: false },
})

export default function MarketsPage() {
  return <MarketsScreen />
}
