import { Suspense } from "react"
import type { Metadata } from "next"

import { AccountAccess } from "@/components/auth/account-access"
import { LoginForm } from "@/components/auth/login-form"
import { Skeleton } from "@/components/ui/skeleton"
import { pageSeo } from "@/lib/seo"
import { company } from "@/lib/site"

export const metadata: Metadata = pageSeo({
  title: "Sign In",
  description: `Sign in to your ${company.name} account to manage your portfolio.`,
  path: "/login",
})

export default function LoginPage() {
  return (
    <AccountAccess mode="login">
      {/* The form reads the return destination from the current URL. */}
      <Suspense fallback={<FormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AccountAccess>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[74px] w-full rounded-xl" />
      <Skeleton className="h-[74px] w-full rounded-xl" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  )
}
