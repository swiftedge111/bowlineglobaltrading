"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, MailCheck, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FormAlert } from "@/components/auth/form-alert"
import { isApiError } from "@/lib/api/client"
import * as api from "@/lib/api/endpoints"
import { EMAIL_RE } from "@/lib/validation"

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setError("Enter your email address.")
      return
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Enter a valid email address.")
      return
    }

    setError(undefined)
    setFormError(null)
    setSubmitting(true)

    try {
      await api.auth.forgotPassword(email.trim().toLowerCase())
      // The API answers identically whether or not the address exists, so this
      // screen must too — anything else turns the form into an account oracle.
      setSent(true)
    } catch (err) {
      setFormError(
        isApiError(err)
          ? err.message
          : "Something went wrong. Please try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-primary-100 bg-linear-to-br from-primary-50 to-white p-5 sm:p-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-700 text-white shadow-md shadow-primary-700/20">
          <MailCheck aria-hidden className="size-6" />
        </span>
        <h2 className="mt-5 text-xl font-semibold tracking-tight text-secondary-900">
          Check your inbox
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-secondary-600">
          If an account exists for{" "}
          <span className="font-semibold text-secondary-900">{email.trim()}</span>, a reset link is on its way.
        </p>
        <p className="mt-4 rounded-xl border border-primary-100 bg-white/80 px-4 py-3 text-sm leading-relaxed text-secondary-600">
          The link expires in 30 minutes. If it doesn’t arrive, check your spam folder or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-semibold text-primary-700 underline underline-offset-2"
          >
            try another address
          </button>
          .
        </p>
        <Button asChild variant="outline" className="mt-5 w-full bg-white sm:w-auto">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError && <FormAlert>{formError}</FormAlert>}

      <div className="space-y-5">
        <Input
          id="email"
          label="Email address"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (error) setError(undefined)
            if (formError) setFormError(null)
          }}
          error={error}
          hint="We'll send a reset link to this address."
        />

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="w-full"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Sending link…
            </>
          ) : (
            <>
              Send Reset Link
              <ArrowRight className="transition-transform group-hover/button:translate-x-0.5" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
