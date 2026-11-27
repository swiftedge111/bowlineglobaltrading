import type { Metadata } from "next"

import { AccountAccess } from "@/components/auth/account-access"
import { SignupForm } from "@/components/auth/signup-form"
import { pageSeo } from "@/lib/seo"

export const metadata: Metadata = pageSeo({
  title: "Open an Account",
  description: "Create a Bowline account to explore markets, compare investment plans, and track your portfolio.",
  path: "/signup",
})

export default function SignupPage() {
  return (
    <AccountAccess mode="signup">
      <SignupForm />
    </AccountAccess>
  )
}
