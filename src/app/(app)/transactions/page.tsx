import type { Metadata } from "next"

import { TransactionsScreen } from "@/components/transactions/transactions-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Transactions",
  description: "Sign in to review your transaction history and track payment updates.",
  path: "/transactions",
  robots: { index: false, follow: false },
})

export default function TransactionsPage() {
  return <TransactionsScreen />
}
