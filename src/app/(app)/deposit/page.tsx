import type { Metadata } from "next"

import { DepositScreen } from "@/components/deposit/deposit-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Deposit",
  description: "Sign in to see available deposit methods and add funds to your Bowline account.",
  path: "/deposit",
  robots: { index: false, follow: false },
})

export default function DepositPage() {
  return <DepositScreen />
}
