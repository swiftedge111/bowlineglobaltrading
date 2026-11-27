import type { Metadata } from "next"

import { WalletScreen } from "@/components/wallet/wallet-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Wallet",
  description: "Sign in to view your balance and manage deposits and withdrawals.",
  path: "/wallet",
  robots: { index: false, follow: false },
})

export default function WalletPage() {
  return <WalletScreen />
}
