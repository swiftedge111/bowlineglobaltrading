"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import {
  AlertTriangle,
  BadgeCheck,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  Monitor,
  Phone,
  ShieldCheck,
  Smartphone,
  User,
  type LucideIcon,
} from "lucide-react"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ErrorState } from "@/components/app/empty-state"
import { PasswordStrength } from "@/components/auth/password-strength"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { isApiError } from "@/lib/api/client"
import * as api from "@/lib/api/endpoints"
import type { DeviceSession } from "@/lib/api/types"
import { formatDate, formatRelative, initials } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/** Profile, contact numbers, password, and the devices signed in. */

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Password", icon: KeyRound },
  { id: "devices", label: "Devices", icon: Monitor },
] as const

function countryName(code: string | null | undefined) {
  if (!code) return null
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

/** `+2348031234570` → `+234 803 123 4570`. */
function prettyPhone(value: string | null | undefined) {
  if (!value) return ""
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value
}

export function SettingsScreen() {
  const { user } = useAuth()

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="min-w-0">
        <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
          Account{" "}
          <span className="inline-block font-serif font-normal text-primary-600 italic">
            settings.
          </span>
        </h2>
        <p className="mt-2 max-w-xl text-sm text-secondary-600 sm:text-base">
          Your details, your password, and every device signed in to your account.
        </p>
      </div>

      <IdentityCard />

      {user && !user.emailVerified && <VerifyEmailBanner email={user.email} />}

      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-24">
          <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={cn(
                    "flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-medium whitespace-nowrap text-secondary-600 transition-colors hover:bg-white hover:text-primary-700 hover:shadow-sm",
                    focusRing
                  )}
                >
                  <section.icon aria-hidden className="size-4" />
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {/* Keyed so a profile reload resets the form to the saved values. */}
          {user && <ProfileSection key={`${user.fullName}|${user.phone}|${user.contactPhone}`} />}
          <PasswordSection />
          <DevicesSection />
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- identity */

function IdentityCard() {
  const { user } = useAuth()
  const country = countryName(user?.country)

  return (
    <section
      aria-label="Your account"
      className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-5 text-white shadow-xl shadow-primary-900/15 sm:p-7"
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/10 font-heading text-xl font-semibold ring-1 ring-white/20">
            {initials(user?.fullName)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold tracking-tight">{user?.fullName ?? "—"}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-primary-100">
              <span className="truncate">{user?.email}</span>
              {user?.emailVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                  <BadgeCheck aria-hidden className="size-3.5" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                  Not verified
                </span>
              )}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 md:shrink-0">
          <div>
            <dt className="text-[11px] text-primary-100">Account ID</dt>
            <dd className="mt-0.5 flex items-center gap-1 font-mono text-sm font-semibold">
              {user?.uid ?? "—"}
              {user?.uid && (
                <CopyButton value={user.uid} label="Copy your account ID" className="p-1 text-primary-100 hover:text-white" />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-primary-100">Username</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold">@{user?.username}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-primary-100">Country</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold">{country ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-primary-100">Member since</dt>
            <dd className="mt-0.5 text-sm font-semibold">{user ? formatDate(user.createdAt) : "—"}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

function VerifyEmailBanner({ email }: { email: string }) {
  const toast = useToast()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function resend() {
    setSending(true)
    try {
      await api.auth.resendVerification(email)
      setSent(true)
      toast.success("Verification email sent", `Check ${email}, including spam.`)
    } catch (cause) {
      toast.fromError(cause, "Could not send the email.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-amber-600 shadow-sm">
          <Mail aria-hidden className="size-4.5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-950">Confirm your email address</p>
          <p className="text-sm text-amber-900">
            {sent ? `We've sent a new link to ${email}.` : `We sent a link to ${email} when you signed up.`}
          </p>
        </div>
      </div>
      <Button size="sm" onClick={() => void resend()} disabled={sending || sent} className="shrink-0">
        {sending ? "Sending…" : sent ? "Sent" : "Resend link"}
      </Button>
    </div>
  )
}

/* ----------------------------------------------------------------- profile */

function ProfileSection() {
  const { user, reload } = useAuth()
  const toast = useToast()

  const initial = {
    fullName: user?.fullName ?? "",
    phone: prettyPhone(user?.phone),
    contactPhone: prettyPhone(user?.contactPhone),
  }
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const dirty =
    values.fullName.trim() !== initial.fullName ||
    values.phone.trim() !== initial.phone ||
    values.contactPhone.trim() !== initial.contactPhone

  const country = countryName(user?.country)

  function set(field: keyof typeof values) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }))
      setErrors((current) => {
        const next = { ...current }
        delete next[field]
        return next
      })
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (values.fullName.trim().length < 3) next.fullName = "Enter your full name."
    if (!values.phone.trim()) next.phone = "Enter your phone number."
    if (!values.contactPhone.trim()) next.contactPhone = "Enter your WhatsApp or Telegram number."
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }

    setSaving(true)
    try {
      // Only what changed, so an untouched number is never re-validated.
      await api.users.updateProfile({
        ...(values.fullName.trim() !== initial.fullName ? { fullName: values.fullName.trim() } : {}),
        ...(values.phone.trim() !== initial.phone ? { phone: values.phone.trim() } : {}),
        ...(values.contactPhone.trim() !== initial.contactPhone ? { contactPhone: values.contactPhone.trim() } : {}),
      })
      await reload()
      toast.success("Profile saved")
    } catch (cause) {
      setErrors(mapFieldErrors(cause))
      toast.fromError(cause, "Could not save your profile.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="profile" aria-labelledby="profile-title" className={cn(card, "scroll-mt-24")}>
      <SectionHeader id="profile-title" icon={User} title="Profile" body="How we address you and how our team reaches you." />
      <form onSubmit={save} noValidate className="space-y-5 p-5 sm:p-6">
        <Input
          id="settings-name"
          label="Full name"
          icon={User}
          value={values.fullName}
          onChange={set("fullName")}
          error={errors.fullName}
          disabled={saving}
          autoComplete="name"
        />
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            id="settings-phone"
            label="Phone number"
            icon={Phone}
            type="tel"
            value={values.phone}
            onChange={set("phone")}
            error={errors.phone}
            hint={country ? `A ${country} number, or any number with its country code.` : "Include the country code, e.g. +44."}
            disabled={saving}
            autoComplete="tel"
          />
          <Input
            id="settings-contact"
            label="WhatsApp or Telegram"
            icon={MessageCircle}
            type="tel"
            value={values.contactPhone}
            onChange={set("contactPhone")}
            error={errors.contactPhone}
            hint="Include the country code, e.g. +44 7911 123456."
            disabled={saving}
          />
        </div>

        <div className="rounded-2xl border border-secondary-200 bg-secondary-50/60 px-4 py-3 text-sm text-secondary-600">
          Your email address and username can only be changed by our support team, to keep your
          account secure.
        </div>

        <div className="flex items-center justify-end gap-3">
          {dirty && !saving && (
            <button
              type="button"
              onClick={() => {
                setValues(initial)
                setErrors({})
              }}
              className={cn("rounded-md px-2 py-1 text-sm font-semibold text-secondary-500 hover:text-secondary-800", focusRing)}
            >
              Discard
            </button>
          )}
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  )
}

/* ---------------------------------------------------------------- password */

function PasswordSection() {
  const { logout } = useAuth()
  const router = useRouter()
  const toast = useToast()

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (!current) found.currentPassword = "Enter your current password."
    if (!next) found.newPassword = "Choose a new password."
    else if (next === current) found.newPassword = "Choose a password you haven't used here."
    if (next && confirm !== next) found.confirmPassword = "The passwords don't match."
    if (Object.keys(found).length) {
      setErrors(found)
      return
    }

    setErrors({})
    setSaving(true)
    try {
      await api.users.changePassword({ currentPassword: current, newPassword: next })
      // The server signs out every session, this one included. Say so and go
      // to sign-in now, rather than letting the next token refresh fail.
      toast.success("Password changed", "Sign in again with your new password.")
      await logout().catch(() => undefined)
      router.replace("/login")
    } catch (cause) {
      setErrors(mapFieldErrors(cause))
      toast.fromError(cause, "Could not change your password.")
      setSaving(false)
    }
  }

  return (
    <section id="security" aria-labelledby="security-title" className={cn(card, "scroll-mt-24")}>
      <SectionHeader id="security-title" icon={KeyRound} title="Password" body="Use a password you don't use anywhere else." />
      <form onSubmit={submit} noValidate className="space-y-5 p-5 sm:p-6">
        <Input
          id="settings-current-password"
          label="Current password"
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={errors.currentPassword}
          disabled={saving}
          autoComplete="current-password"
        />
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <Input
              id="settings-new-password"
              label="New password"
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              error={errors.newPassword}
              disabled={saving}
              autoComplete="new-password"
            />
            {next && (
              <div className="mt-2">
                <PasswordStrength password={next} />
              </div>
            )}
          </div>
          <Input
            id="settings-confirm-password"
            label="Confirm new password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            error={errors.confirmPassword}
            disabled={saving}
            autoComplete="new-password"
          />
        </div>

        <p className="flex items-start gap-2 rounded-2xl border border-primary-200 bg-primary-50/60 px-4 py-3 text-sm text-secondary-700">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-600" />
          Changing your password signs you out on every device, this one included. You&apos;ll sign
          in again with the new one.
        </p>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </section>
  )
}

/* ----------------------------------------------------------------- devices */

/** A readable label from a user-agent string. Good enough to recognise a device. */
function describeDevice(userAgent: string | null): { label: string; icon: LucideIcon } {
  const ua = userAgent ?? ""
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null
  const mobile = /iPhone|Android.*Mobile|Mobile Safari/.test(ua)

  const label = browser && os ? `${browser} on ${os}` : browser ?? os ?? "Unknown device"
  return { label, icon: mobile ? Smartphone : Monitor }
}

/** Loopback addresses only appear in local development; say so plainly. */
function displayIp(ip: string | null) {
  if (!ip) return "Unknown location"
  return ip === "::1" || ip === "127.0.0.1" ? "Local" : ip
}

function DevicesSection() {
  const { logout } = useAuth()
  const router = useRouter()
  const toast = useToast()
  const sessions = useAsyncData(() => api.auth.sessions(), "sessions")

  const [revoking, setRevoking] = useState<DeviceSession | null>(null)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const [allBusy, setAllBusy] = useState(false)

  const list = sessions.data?.sessions ?? []
  const others = list.filter((session) => !session.current)

  async function revoke() {
    if (!revoking) return
    setRevokeBusy(true)
    try {
      await api.auth.revokeSession(revoking.id)
      toast.success("Device signed out")
      setRevoking(null)
      sessions.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not sign that device out.")
      sessions.reload()
    } finally {
      setRevokeBusy(false)
    }
  }

  async function signOutEverywhere() {
    setAllBusy(true)
    try {
      await api.auth.logoutEverywhere()
      // This device is revoked too, so land on sign-in rather than a shell
      // that fails on its next request.
      await logout().catch(() => undefined)
      router.replace("/login")
    } catch (cause) {
      toast.fromError(cause, "Could not sign out everywhere.")
      setAllBusy(false)
      setConfirmAll(false)
    }
  }

  return (
    <section id="devices" aria-labelledby="devices-title" className={cn(card, "scroll-mt-24")}>
      <SectionHeader
        id="devices-title"
        icon={Monitor}
        title="Devices"
        body="Browsers and phones signed in to your account. Sign out any you don't recognise."
      />

      <div className="p-5 sm:p-6">
        {sessions.error && !sessions.data ? (
          <ErrorState title="Could not load your devices" onRetry={sessions.reload} className="py-8" />
        ) : sessions.loading && !sessions.data ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-secondary-100 rounded-2xl border border-secondary-200">
            {list.map((session) => {
              const device = describeDevice(session.userAgent)
              return (
                <li key={session.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
                      session.current ? "bg-primary-700 text-white ring-primary-700" : "bg-secondary-100 text-secondary-600 ring-secondary-200"
                    )}
                  >
                    <device.icon aria-hidden className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {device.label}
                      {session.current && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-secondary-500">
                      {displayIp(session.ip)} ·{" "}
                      {session.current ? "Active now" : `Active ${formatRelative(session.lastActiveAt)}`}
                      {!session.persistent && " · until the browser closes"}
                    </p>
                  </div>
                  {!session.current && (
                    <button
                      type="button"
                      onClick={() => setRevoking(session)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-secondary-500 transition-colors outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-4 focus-visible:ring-red-100"
                    >
                      Sign out
                    </button>
                  )}
                </li>
              )
            })}
            {list.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-secondary-500">No active sessions found.</li>
            )}
          </ul>
        )}

        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden className="mt-0.5 size-4.5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold text-secondary-900">Sign out everywhere</p>
              <p className="text-sm text-secondary-600">
                Every device{others.length > 0 ? `, including ${others.length} other${others.length === 1 ? "" : "s"},` : ""} and this one. Use it if you
                signed in on a shared computer.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => setConfirmAll(true)}
            className="shrink-0 border border-red-300 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut aria-hidden /> Sign out everywhere
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !revokeBusy && !open && setRevoking(null)}
        title="Sign this device out?"
        description={
          revoking && (
            <>
              {describeDevice(revoking.userAgent).label}
              {revoking.ip ? ` (${displayIp(revoking.ip)})` : ""} will need to sign in again to use your account.
            </>
          )
        }
        confirmLabel="Sign out device"
        tone="danger"
        busy={revokeBusy}
        onConfirm={() => void revoke()}
      />

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={(open) => !allBusy && setConfirmAll(open)}
        title="Sign out everywhere?"
        description="Every device, including this one, will be signed out. You'll need to sign in again."
        confirmLabel="Sign out everywhere"
        tone="danger"
        busy={allBusy}
        onConfirm={() => void signOutEverywhere()}
      />
    </section>
  )
}

/* ------------------------------------------------------------------ shared */

function SectionHeader({
  id,
  icon: Icon,
  title,
  body,
}: {
  id: string
  icon: LucideIcon
  title: string
  body: string
}) {
  return (
    <div className="flex items-start gap-3 border-b border-secondary-200 px-5 py-4 sm:px-6">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
        <Icon aria-hidden className="size-4.5" />
      </span>
      <div>
        <h3 id={id} className="font-sans text-base font-semibold">
          {title}
        </h3>
        <p className="text-sm text-secondary-600">{body}</p>
      </div>
    </div>
  )
}

/** Puts `error.details[].path` back onto the matching input. */
function mapFieldErrors(cause: unknown): Record<string, string> {
  if (!isApiError(cause) || !cause.details?.length) return {}
  const mapped: Record<string, string> = {}
  for (const detail of cause.details) {
    const key = detail.path?.split(".").pop()
    if (key) mapped[key] = detail.message
  }
  return mapped
}
