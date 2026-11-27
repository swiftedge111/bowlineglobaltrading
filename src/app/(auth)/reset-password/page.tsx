import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { company } from "@/lib/site"

import { PasswordRecoveryShell } from "@/components/auth/password-recovery-shell"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = {
  title: "Set a New Password",
  description: `Choose a new password for your ${company.name} account.`,
  // A page reachable only via a one-time emailed token has no business in an
  // index.
  robots: { index: false, follow: false },
}

export default function ResetPasswordPage() {
  return (
    <PasswordRecoveryShell
      title="Set a new password"
      subtitle="Choose a strong password you haven’t used elsewhere. You’ll sign in with it after the update."
      panelTitle="A fresh password. A clear path back in."
      panelDescription="Use the one-time link from your email to finish securing your account."
      steps={["Use your reset link", "Create a strong password", "Sign in again"]}
      footer={
        <>
          Remembered it after all?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary-600 underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      {/* The form reads `?token=`, which is only available once the client
          takes over. */}
      <Suspense fallback={<FormSkeleton />}>
        <ResetPasswordForm />
      </Suspense>
    </PasswordRecoveryShell>
  )
}

function FormSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-[74px] w-full rounded-xl" />
      <Skeleton className="h-[74px] w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  )
}
