import type { Metadata } from "next"
import Link from "next/link"
import { company } from "@/lib/site"

import { pageSeo } from "@/lib/seo"
import { PasswordRecoveryShell } from "@/components/auth/password-recovery-shell"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = pageSeo({
  title: "Reset Your Password",
  description:
    `Request an email link to reset your ${company.name} password and get back into your account.`,
  path: "/forgot-password",
})

export default function ForgotPasswordPage() {
  return (
    <PasswordRecoveryShell
      title="Forgot your password?"
      subtitle="Enter the email address on your account and we'll send you a link to set a new password."
      panelTitle="Get back to your account, step by step."
      panelDescription="We’ll send a one-time link to the email address connected to your account."
      steps={["Enter your account email", "Open the reset link", "Choose a new password"]}
      footer={
        <>
          Remembered it?{" "}
          <Link
            href="/login"
            className="font-semibold text-primary-600 underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </PasswordRecoveryShell>
  )
}
