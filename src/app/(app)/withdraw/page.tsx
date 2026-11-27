import type { Metadata } from "next"

import { WithdrawScreen } from "@/components/withdraw/withdraw-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Withdraw",
  description: "Sign in to review withdrawal options and request a withdrawal from your Bowline account.",
  path: "/withdraw",
  robots: { index: false, follow: false },
})

export default function WithdrawPage() {
  return <WithdrawScreen />
}
