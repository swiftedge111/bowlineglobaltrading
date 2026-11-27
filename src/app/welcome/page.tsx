import type { Metadata } from "next"

import { RequireAuth } from "@/components/app/require-auth"
import { WelcomeScreen } from "@/components/welcome/welcome-screen"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Welcome",
  description: "Get familiar with your Bowline account and see how to find your portfolio, plans, and wallet.",
  path: "/welcome",
  robots: { index: false, follow: false },
})

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
