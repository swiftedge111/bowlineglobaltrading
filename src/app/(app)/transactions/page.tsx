import type { Metadata } from "next"
import { company } from "@/lib/site"

import { TransactionsScreen } from "@/components/transactions/transactions-screen"

export const metadata: Metadata = {
  title: "Transactions",
  description: `Your ${company.name} transaction history.`,
  robots: { index: false, follow: false },
}

export default function TransactionsPage() {
  return <TransactionsScreen />
}
