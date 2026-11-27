"use client"

import { useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Banknote,
  Bitcoin,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Hourglass,
  Mail,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  UploadCloud,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import {
  BankPaymentDetails,
  CryptoPaymentDetails,
  DigitalWalletPaymentDetails,
} from "@/components/deposit/payment-details"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { isApiError } from "@/lib/api/client"
import * as api from "@/lib/api/endpoints"
import type {
  DepositMethod,
  DepositMethods,
  DepositRequest,
} from "@/lib/api/types"
import { formatDateTime, formatMoney } from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/** Pay us, then tell us about it: a three-step deposit request. */

/** Mirrors the server's own limits in `config/constants.ts`. */
const MAX_PROOF_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"]

const METHOD_META: Record<
  DepositMethod,
  { label: string; blurb: string; icon: LucideIcon }
> = {
  BANK_TRANSFER: { label: "Bank transfer", blurb: "From your bank account", icon: Banknote },
  CRYPTO: { label: "Crypto", blurb: "BTC, USDT and more", icon: Bitcoin },
  DIGITAL_WALLET: { label: "Digital wallet", blurb: "PayPal and similar", icon: Smartphone },
  CARD: { label: "Card", blurb: "Arranged by support", icon: CreditCard },
}

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

const cents = (value: string | null | undefined) =>
  Math.round(Number(value ?? "0") * 100) || 0

export function DepositScreen() {
  const toast = useToast()
  const { user } = useAuth()
  const methods = useAsyncData(() => api.deposits.methods(), "deposit-methods")
  const history = useAsyncData(() => api.deposits.list(), "deposit-history")
  const plans = useAsyncData(() => api.plans.list(), "plans")

  const [picked, setPicked] = useState<DepositMethod | null>(null)
  const [cryptoIndex, setCryptoIndex] = useState(0)
  const [amount, setAmount] = useState("")
  const [reference, setReference] = useState("")
  const [proof, setProof] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const config = methods.data

  // Only offer what the admin has actually configured. An empty crypto list
  // means there is no wallet to pay into, and offering it would be a dead end.
  const offered = useMemo<DepositMethod[]>(() => {
    if (!config) return []
    const list: DepositMethod[] = []
    if (config.bank) list.push("BANK_TRANSFER")
    if (config.crypto.length > 0) list.push("CRYPTO")
    if (config.digitalWallets.length > 0) list.push("DIGITAL_WALLET")
    list.push("CARD")
    return list
  }, [config])

  // Default to the first method that exists, never to one that does not.
  const method: DepositMethod | null =
    picked && offered.includes(picked) ? picked : (offered[0] ?? null)

  const deposits = history.data?.deposits ?? []
  const pending = deposits.filter((item) => item.status === "PENDING")
  const pendingTotal = (pending.reduce((sum, item) => sum + cents(item.amount), 0) / 100).toFixed(2)

  // Plan minimums double as sensible amounts to send.
  const amountPicks = useMemo(() => {
    const floor = cents(config?.minimumDeposit)
    return (plans.data?.plans ?? [])
      .filter((plan) => cents(plan.minDeposit) >= floor)
      .map((plan) => ({ label: plan.name, value: plan.minDeposit }))
  }, [plans.data, config])

  function clearProof() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setProof(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  function pickFile(file: File | null) {
    if (!file) return clearProof()

    if (!ALLOWED_MIME.includes(file.type)) {
      setFieldErrors((current) => ({ ...current, proof: "Upload a JPEG, PNG, WebP or PDF." }))
      return
    }
    if (file.size > MAX_PROOF_BYTES) {
      setFieldErrors((current) => ({
        ...current,
        proof: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`,
      }))
      return
    }

    setFieldErrors((current) => {
      const next = { ...current }
      delete next.proof
      return next
    })
    if (preview) URL.revokeObjectURL(preview)
    setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null)
    setProof(file)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting || !method) return

    const numeric = Number(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setFieldErrors({ amount: "Enter the amount you sent." })
      return
    }
    if (cents(amount) < cents(config?.minimumDeposit)) {
      setFieldErrors({ amount: `The minimum deposit is ${formatMoney(config?.minimumDeposit)}.` })
      return
    }

    setFieldErrors({})
    setSubmitting(true)
    try {
      await api.deposits.create({
        amount: numeric,
        method,
        reference: reference.trim() || undefined,
        proof,
      })
      toast.success(
        "Deposit submitted for review",
        "We'll email you as soon as it's confirmed and credited."
      )
      setAmount("")
      setReference("")
      clearProof()
      history.reload()
    } catch (cause) {
      // Field-level problems belong on the field, not only in a toast.
      if (isApiError(cause) && cause.details?.length) {
        const mapped: Record<string, string> = {}
        for (const detail of cause.details) {
          const key = detail.path?.split(".").pop()
          if (key) mapped[key] = detail.message
        }
        setFieldErrors(mapped)
      }
      toast.fromError(cause, "Could not submit the deposit.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Fund your{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              account.
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-secondary-600 sm:text-base">
            Send a payment using the details below, then tell us about it. We credit your balance
            once our team confirms it has arrived.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {config && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary-200 bg-white px-3 py-1.5 text-xs font-semibold text-secondary-700 shadow-sm">
              Minimum <span className="tabular-nums">{formatMoney(config.minimumDeposit)}</span>
            </span>
          )}
          {pending.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <Hourglass aria-hidden className="size-3.5" />
              {pending.length} pending · <span className="tabular-nums">{formatMoney(pendingTotal)}</span>
            </span>
          )}
        </div>
      </div>

      {methods.error && !config ? (
        <ErrorState title="Could not load payment details" onRetry={methods.reload} />
      ) : methods.loading && !config ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <Skeleton className="h-[40rem] rounded-[1.5rem]" />
          <Skeleton className="h-80 rounded-[1.5rem]" />
        </div>
      ) : (
        config &&
        method && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            {/* Flow */}
            <div className={cn(card, "min-w-0 divide-y divide-secondary-200")}>
              {/* 1. Method */}
              <Step number={1} title="Choose how to pay">
                <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {offered.map((value) => {
                    const meta = METHOD_META[value]
                    const active = method === value
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setPicked(value)
                          setFieldErrors({})
                        }}
                        className={cn(
                          "relative flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-left transition-all",
                          focusRing,
                          active
                            ? "border-primary-600 bg-primary-50/70 ring-1 ring-primary-600"
                            : "border-secondary-200 bg-white hover:border-primary-300"
                        )}
                      >
                        <span
                          className={cn(
                            "grid size-9 place-items-center rounded-xl",
                            active ? "bg-primary-700 text-white" : "bg-secondary-100 text-secondary-600"
                          )}
                        >
                          <meta.icon aria-hidden className="size-4.5" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">{meta.label}</span>
                          <span className="block text-xs text-secondary-500">{meta.blurb}</span>
                        </span>
                        {active && (
                          <CheckCircle2 aria-hidden className="absolute top-3 right-3 size-4.5 text-primary-700" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </Step>

              {/* 2. Send */}
              <Step number={2} title={method === "CARD" ? "Arrange a card payment" : "Send your payment"}>
                <MethodDetails
                  method={method}
                  config={config}
                  cryptoIndex={Math.min(cryptoIndex, Math.max(config.crypto.length - 1, 0))}
                  onCryptoIndex={setCryptoIndex}
                  accountId={user?.uid ?? null}
                />
              </Step>

              {/* 3. Confirm */}
              {method === "CARD" ? (
                <Step number={3} title="We'll take it from there">
                  <p className="text-sm leading-relaxed text-secondary-600">
                    Support sends you a secure payment link and credits your balance once the
                    payment clears. We never take card numbers through this page.
                  </p>
                </Step>
              ) : (
                <Step number={3} title="Tell us you've paid">
                  <form onSubmit={submit} className="space-y-5" noValidate>
                    <div className="space-y-2.5">
                      <Input
                        id="deposit-amount"
                        label="Amount you sent (USD)"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        error={fieldErrors.amount}
                        hint={`Minimum ${formatMoney(config.minimumDeposit)}`}
                        disabled={submitting}
                      />
                      {amountPicks.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-secondary-500">Plan minimums:</span>
                          {amountPicks.map((pick) => (
                            <button
                              key={pick.label}
                              type="button"
                              disabled={submitting}
                              onClick={() => setAmount(pick.value)}
                              className={cn(
                                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                                focusRing,
                                cents(amount) === cents(pick.value)
                                  ? "border-primary-600 bg-primary-50 text-primary-700"
                                  : "border-secondary-200 text-secondary-600 hover:border-primary-300 hover:text-primary-700"
                              )}
                            >
                              {pick.label} · {formatMoney(pick.value)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <Input
                      id="deposit-reference"
                      label={method === "CRYPTO" ? "Transaction hash" : "Payment reference"}
                      optional
                      placeholder={
                        method === "CRYPTO"
                          ? "The transaction ID from your wallet"
                          : "The reference shown on your receipt"
                      }
                      value={reference}
                      onChange={(event) => setReference(event.target.value)}
                      error={fieldErrors.reference}
                      hint="Helps our team match your payment faster."
                      disabled={submitting}
                    />

                    <div>
                      <span className="mb-2 block text-sm font-medium text-secondary-700">
                        Proof of payment
                        <span className="ml-1.5 text-xs font-normal text-secondary-400">optional, recommended</span>
                      </span>

                      <input
                        ref={fileInput}
                        id="deposit-proof"
                        type="file"
                        accept={ALLOWED_MIME.join(",")}
                        className="sr-only"
                        disabled={submitting}
                        onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                      />

                      {proof ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-secondary-200 bg-secondary-50/60 p-3">
                          {preview ? (
                            // A local object URL; next/image cannot optimise it.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt="" className="size-14 shrink-0 rounded-xl object-cover ring-1 ring-secondary-200" />
                          ) : (
                            <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-white text-primary-700 ring-1 ring-secondary-200">
                              <FileText aria-hidden className="size-6" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{proof.name}</p>
                            <p className="text-xs text-secondary-500 tabular-nums">
                              {(proof.size / 1024).toFixed(0)} KB · ready to upload
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={clearProof}
                            aria-label="Remove file"
                            disabled={submitting}
                            className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-secondary-400 transition-colors hover:bg-secondary-200 hover:text-secondary-700", focusRing)}
                          >
                            <X aria-hidden className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="deposit-proof"
                          onDragOver={(event) => {
                            event.preventDefault()
                            setDragging(true)
                          }}
                          onDragLeave={() => setDragging(false)}
                          onDrop={(event) => {
                            event.preventDefault()
                            setDragging(false)
                            pickFile(event.dataTransfer.files?.[0] ?? null)
                          }}
                          className={cn(
                            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors",
                            dragging
                              ? "border-primary-500 bg-primary-50"
                              : "border-secondary-300 bg-secondary-50/50 hover:border-primary-400 hover:bg-primary-50/40"
                          )}
                        >
                          <span className="grid size-11 place-items-center rounded-full bg-white text-primary-700 shadow-sm ring-1 ring-secondary-200">
                            <UploadCloud aria-hidden className="size-5" />
                          </span>
                          <span className="text-sm">
                            <span className="font-semibold text-primary-700">Choose a file</span>{" "}
                            <span className="text-secondary-600">or drag it here</span>
                          </span>
                          <span className="text-xs text-secondary-500">
                            A receipt or screenshot · JPEG, PNG, WebP or PDF up to 5 MB
                          </span>
                        </label>
                      )}
                      {fieldErrors.proof && (
                        <p role="alert" className="mt-1.5 text-sm text-red-600">{fieldErrors.proof}</p>
                      )}
                    </div>

                    <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                      {submitting ? "Submitting…" : "Submit for review"}
                      {!submitting && <ArrowRight aria-hidden />}
                    </Button>
                    <p className="text-center text-xs text-secondary-500">
                      Your balance updates when our team confirms the payment, not when you submit
                      this form.
                    </p>
                  </form>
                </Step>
              )}
            </div>

            {/* Side */}
            <aside className="space-y-6 lg:sticky lg:top-24">
              <section
                aria-labelledby="next-title"
                className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-6 text-white shadow-xl shadow-primary-900/15"
              >
                <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 -z-10 size-56 rounded-full bg-sky-400/20 blur-3xl" />
                <h3 id="next-title" className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">
                  What happens next
                </h3>
                <ol className="mt-5 space-y-5">
                  {[
                    { icon: ReceiptText, title: "You submit the request", body: "It shows below as pending." },
                    { icon: ShieldCheck, title: "Our team checks the payment", body: "We match it to your reference and proof." },
                    { icon: CheckCircle2, title: "Your balance is credited", body: "We email you the moment it lands." },
                  ].map((step, index, list) => (
                    <li key={step.title} className="relative flex gap-3">
                      {index < list.length - 1 && (
                        <span aria-hidden className="absolute top-10 bottom-[-1.25rem] left-[1.125rem] w-px bg-white/15" />
                      )}
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sky-200 ring-1 ring-white/15">
                        <step.icon aria-hidden className="size-4.5" />
                      </span>
                      <div className="pt-0.5">
                        <p className="text-sm font-semibold">{step.title}</p>
                        <p className="text-sm text-primary-100">{step.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section className={cn(card, "p-5")}>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Mail aria-hidden className="size-4 text-primary-600" /> Need help with a payment?
                </p>
                <p className="mt-1 text-sm text-secondary-600">
                  Include your account ID{user?.uid ? <> (<span className="font-mono font-semibold text-secondary-900">{user.uid}</span>)</> : null} when you contact us.
                </p>
                <a
                  href={`mailto:${config.supportEmail}`}
                  className={cn("mt-3 inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary-700 hover:text-primary-800", focusRing)}
                >
                  {config.supportEmail} <ArrowRight aria-hidden className="size-4" />
                </a>
              </section>
            </aside>
          </div>
        )
      )}

      {/* History */}
      <section aria-labelledby="history-title" className={cn(card, "p-5 sm:p-6")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id="history-title" className="font-sans text-base font-semibold">
            Your deposits
          </h3>
          {deposits.length > 0 && (
            <span className="text-xs text-secondary-500 tabular-nums">{deposits.length} total</span>
          )}
        </div>
        <DepositHistory
          data={deposits}
          loading={history.loading && !history.data}
          error={Boolean(history.error && !history.data)}
          onRetry={history.reload}
        />
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ steps */

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`step-${number}`} className="p-5 sm:p-7">
      <h3 id={`step-${number}`} className="mb-4 flex items-center gap-3 font-sans text-base font-semibold">
        <span className="grid size-7 place-items-center rounded-full border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-700 tabular-nums">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function MethodDetails({
  method,
  config,
  cryptoIndex,
  onCryptoIndex,
  accountId,
}: {
  method: DepositMethod
  config: DepositMethods
  cryptoIndex: number
  onCryptoIndex: (index: number) => void
  accountId: string | null
}) {
  if (method === "BANK_TRANSFER" && config.bank) {
    const bank = config.bank
    return (
      <div className="space-y-3">
        <BankPaymentDetails bank={bank} />
        {accountId && <ReferenceTip accountId={accountId} />}
      </div>
    )
  }

  if (method === "CRYPTO" && config.crypto.length > 0) {
    const wallet = config.crypto[cryptoIndex]!
    return (
      <div className="space-y-3">
        {config.crypto.length > 1 && (
          <div role="radiogroup" aria-label="Currency" className="flex flex-wrap gap-2">
            {config.crypto.map((item, index) => (
              <button
                key={`${item.currency}-${item.walletAddress}`}
                type="button"
                role="radio"
                aria-checked={index === cryptoIndex}
                onClick={() => onCryptoIndex(index)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
                  focusRing,
                  index === cryptoIndex
                    ? "border-primary-700 bg-primary-700 text-white"
                    : "border-secondary-200 text-secondary-700 hover:border-primary-300"
                )}
              >
                {item.currency}
              </button>
            ))}
          </div>
        )}

        <CryptoPaymentDetails wallet={wallet} />
      </div>
    )
  }

  if (method === "DIGITAL_WALLET") {
    return (
      <div className="space-y-3">
        {config.digitalWallets.map((wallet) => (
          <DigitalWalletPaymentDetails
            key={`${wallet.provider}-${wallet.handle}`}
            wallet={wallet}
          />
        ))}
        {accountId && <ReferenceTip accountId={accountId} />}
      </div>
    )
  }

  // Card.
  return (
    <div className="rounded-2xl border border-secondary-200 bg-secondary-50/60 p-5">
      <p className="text-sm leading-relaxed text-secondary-600">
        Card payments are set up one at a time. Email our team with the amount you want to deposit
        and your account ID, and we&apos;ll send a secure payment link.
      </p>
      <Button asChild className="mt-4">
        <a
          href={`mailto:${config.supportEmail}?subject=${encodeURIComponent("Card deposit")}`}
        >
          <Mail aria-hidden /> Email {config.supportEmail}
        </a>
      </Button>
    </div>
  )
}

/** The account ID in the payment note is what lets the team match it. */
function ReferenceTip({ accountId }: { accountId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary-900">Add your account ID to the payment note</p>
        <p className="text-xs text-secondary-600">It lets our team match your payment straight away.</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 rounded-lg bg-white py-1 pr-1 pl-2.5 ring-1 ring-primary-200">
        <span className="font-mono text-sm font-semibold">{accountId}</span>
        <CopyButton value={accountId} label="Copy your account ID" />
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- history */

const STATUS_ICON: Record<DepositRequest["status"], { icon: LucideIcon; tone: string }> = {
  PENDING: { icon: Clock, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  APPROVED: { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  REJECTED: { icon: XCircle, tone: "bg-red-50 text-red-600 ring-red-100" },
  CANCELLED: { icon: XCircle, tone: "bg-secondary-100 text-secondary-500 ring-secondary-200" },
}

function DepositHistory({
  data,
  loading,
  error,
  onRetry,
}: {
  data: DepositRequest[]
  loading: boolean
  error: boolean
  onRetry: () => void
}) {
  if (error) {
    return <ErrorState title="Could not load your deposits" onRetry={onRetry} className="py-8" />
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-6 py-10 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-white text-secondary-400 ring-1 ring-secondary-200">
          <Banknote aria-hidden className="size-5" />
        </span>
        <p className="mt-3 font-semibold">No deposits yet</p>
        <p className="mt-1 max-w-xs text-sm text-secondary-600">
          Once you submit one, you can follow it here from review to credit.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-secondary-100">
      {data.map((deposit) => {
        const status = STATUS_ICON[deposit.status] ?? STATUS_ICON.PENDING
        return (
          <li key={deposit.id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full ring-1", status.tone)}>
                <status.icon aria-hidden className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  <span className="tabular-nums">{formatMoney(deposit.amount)}</span>
                  <span className="ml-2 font-normal text-secondary-500">
                    {METHOD_META[deposit.method]?.label ?? deposit.method}
                  </span>
                </p>
                <p className="truncate text-xs text-secondary-500">
                  {formatDateTime(deposit.createdAt)}
                  {deposit.reference && <> · ref {deposit.reference}</>}
                  {deposit.hasProof && <> · proof attached</>}
                </p>
              </div>
              <StatusBadge status={deposit.status} />
            </div>
            {deposit.reviewNote && (
              <p className="mt-2.5 ml-[3.25rem] rounded-xl bg-secondary-50 px-3 py-2 text-sm text-secondary-600">
                <span className="font-semibold text-secondary-800">Note from our team:</span>{" "}
                {deposit.reviewNote}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
