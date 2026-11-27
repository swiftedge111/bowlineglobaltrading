import type { Metadata } from "next"

import { AccountAccess } from "@/components/auth/account-access"
import { SignupForm } from "@/components/auth/signup-form"
import { pageSeo } from "@/lib/seo"
import { company } from "@/lib/site"

export const metadata: Metadata = pageSeo({
  title: "Open an Account",
  description: `Create a ${company.name} account and set up access to your dashboard.`,
  path: "/signup",
})

export default function SignupPage() {
  return (
    <AccountAccess mode="signup">
      <SignupForm />
    </AccountAccess>
  )
}
