import type { Metadata } from "next"
import { company } from "@/lib/site"

import { DepositScreen } from "@/components/deposit/deposit-screen"

export const metadata: Metadata = {
  title: "Deposit",
  description: `Fund your ${company.name} account.`,
  robots: { index: false, follow: false },
}

export default function DepositPage() {
  return <DepositScreen />
}
