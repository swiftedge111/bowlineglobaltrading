import type { Metadata } from "next"
import { company } from "@/lib/site"

import { RequireAuth } from "@/components/app/require-auth"
import { WelcomeScreen } from "@/components/welcome/welcome-screen"

export const metadata: Metadata = {
  title: "Welcome",
  description: `Get your ${company.name} account ready to trade.`,
  robots: { index: false, follow: false },
}

/**
 * Sits outside the `(app)` shell deliberately: onboarding is a full-page
 * moment, not a dashboard screen with a sidebar competing for attention.
 */
export default function WelcomePage() {
  return (
    <RequireAuth>
      <WelcomeScreen />
    </RequireAuth>
  )
}
