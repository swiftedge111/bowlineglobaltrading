import type { Metadata } from "next"
import { company } from "@/lib/site"

import { WithdrawScreen } from "@/components/withdraw/withdraw-screen"

export const metadata: Metadata = {
  title: "Withdraw",
  description: `Withdraw funds from your ${company.name} account.`,
  robots: { index: false, follow: false },
}

export default function WithdrawPage() {
  return <WithdrawScreen />
}
