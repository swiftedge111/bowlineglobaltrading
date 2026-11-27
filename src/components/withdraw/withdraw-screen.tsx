"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Bitcoin,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  Send,
  ShieldCheck,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ErrorState } from "@/components/app/empty-state"
import { PinInput } from "@/components/app/pin-input"
import { StatusBadge } from "@/components/app/status-badge"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { isApiError } from "@/lib/api/client"
import * as api from "@/lib/api/endpoints"
import type {
  BankDestination,
  CreateWithdrawalInput,
  CryptoDestination,
  WithdrawalMethod,
  WithdrawalRequest,
} from "@/lib/api/types"
import { formatDateTime, formatMoney } from "@/lib/format"
import { company } from "@/lib/site"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/**
 * Request a withdrawal, authorised by a one-time PIN.
 *
 * The fee is charged on top: the destination receives the amount entered, and
 * the amount plus the fee is reserved from the balance. That is how the server
 * charges it (`total = amount + fee`), so every figure here says the same.
 */

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

const CURRENCIES = ["USDT", "BTC", "ETH", "USDC"]
const NETWORKS = ["TRC-20", "ERC-20", "BEP-20", "Bitcoin"]

/* Money in whole cents. Inputs are converted once and results go back to strings. */
const toCents = (value: string | null | undefined) => {
  const parsed = Math.round(Number(value ?? "0") * 100)
  return Number.isFinite(parsed) ? parsed : 0
}
const fromCents = (value: number) => (value / 100).toFixed(2)

/** The server's fee: the percentage of the amount, rounded half up to the cent. */
const feeFor = (amountCents: number, percent: number) =>
  Math.round((amountCents * percent) / 100)

/** The largest amount whose amount-plus-fee fits in what is available. */
function maxWithdrawable(availableCents: number, percent: number) {
  if (availableCents <= 0) return 0
  let amount = Math.floor((availableCents * 100) / (100 + percent))
  while (amount > 0 && amount + feeFor(amount, percent) > availableCents) amount -= 1
  while (amount + 1 + feeFor(amount + 1, percent) <= availableCents) amount += 1
  return amount
}

export function WithdrawScreen() {
  const toast = useToast()
  const { user } = useAuth()
  const portfolio = useAsyncData(() => api.portfolio.summary(), "portfolio")
  const history = useAsyncData(() => api.withdrawals.list(), "withdrawals")

  const [method, setMethod] = useState<WithdrawalMethod>("CRYPTO")
  const [amount, setAmount] = useState("")
  const [crypto, setCrypto] = useState({ walletAddress: "", network: "", currency: "" })
  const [bank, setBank] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    routingNumber: "",
    swiftCode: "",
  })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirming, setConfirming] = useState(false)
  const [pin, setPin] = useState("")
  const [pinError, setPinError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState<WithdrawalRequest | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)

  const limits = history.data?.limits
  const percent = Number(limits?.feePercent ?? "0")
  const minimumCents = toCents(limits?.minimum)
  const summary = portfolio.data
  const availableCents = toCents(summary?.available)

  const amountCents = toCents(amount)
  const feeCents = amountCents > 0 ? feeFor(amountCents, percent) : 0
  const totalCents = amountCents + feeCents
  const afterCents = availableCents - totalCents
  const maxCents = maxWithdrawable(availableCents, percent)

  const withdrawals = history.data?.withdrawals ?? []
  const pending = withdrawals.filter((item) => item.status === "PENDING")

  const pinHelp = company.email
    ? `mailto:${company.email}?subject=${encodeURIComponent("Withdrawal PIN request")}&body=${encodeURIComponent(`Please issue a withdrawal PIN for account ${user?.uid ?? ""}.`)}`
    : null

  function setAmountCents(value: number) {
    setAmount(fromCents(value))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next.amount
      return next
    })
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}

    if (amountCents <= 0) {
      errors.amount = "Enter an amount."
    } else if (amountCents < minimumCents) {
      errors.amount = `The minimum withdrawal is ${formatMoney(limits?.minimum)}.`
    } else if (totalCents > availableCents) {
      // Told now, before a PIN is spent on a request the server would refuse.
      errors.amount = `With the ${formatMoney(fromCents(feeCents))} fee this needs ${formatMoney(fromCents(totalCents))}, and ${formatMoney(summary?.available)} is available. The most you can withdraw is ${formatMoney(fromCents(maxCents))}.`
    }

    if (method === "CRYPTO") {
      if (!crypto.walletAddress.trim()) errors.walletAddress = "Enter the wallet address to send to."
      if (!crypto.network.trim()) errors.network = "Choose or enter the network."
    } else {
      if (!bank.bankName.trim()) errors.bankName = "Enter the bank name."
      if (!bank.accountName.trim()) errors.accountName = "Enter the account holder's name."
      if (!bank.accountNumber.trim()) errors.accountNumber = "Enter the account number."
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function review(event: React.FormEvent) {
    event.preventDefault()
    if (!validate()) return
    setPin("")
    setPinError(undefined)
    setConfirming(true)
  }

  async function submit() {
    if (pin.length < 6) {
      setPinError("Enter all 6 digits of your PIN.")
      return
    }

    setSubmitting(true)
    setPinError(undefined)

    const payload: CreateWithdrawalInput =
      method === "CRYPTO"
        ? {
            amount: Number(fromCents(amountCents)),
            method,
            pin,
            walletAddress: crypto.walletAddress.trim(),
            network: crypto.network.trim(),
            currency: crypto.currency.trim() || undefined,
          }
        : {
            amount: Number(fromCents(amountCents)),
            method,
            pin,
            bankName: bank.bankName.trim(),
            accountName: bank.accountName.trim(),
            accountNumber: bank.accountNumber.trim(),
            routingNumber: bank.routingNumber.trim() || undefined,
            swiftCode: bank.swiftCode.trim() || undefined,
          }

    try {
      await api.withdrawals.create(payload)
      toast.success(
        "Withdrawal requested",
        `${formatMoney(fromCents(totalCents))} is reserved while our team reviews it.`
      )
      setConfirming(false)
      setAmount("")
      setPin("")
      history.reload()
      portfolio.reload()
    } catch (cause) {
      // A wrong PIN keeps the dialog open so it can be retyped in place.
      if (isApiError(cause) && /pin/i.test(cause.message)) {
        setPinError(cause.message)
        setPin("")
      } else {
        setConfirming(false)
        toast.fromError(cause, "Could not submit the withdrawal.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function cancel() {
    if (!cancelling) return
    setCancelBusy(true)
    try {
      await api.withdrawals.cancel(cancelling.id)
      toast.success("Withdrawal cancelled", "The reserved amount is available again.")
      setCancelling(null)
      history.reload()
      portfolio.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not cancel the request.")
      history.reload()
    } finally {
      setCancelBusy(false)
    }
  }

  const destinationSummary =
    method === "CRYPTO"
      ? `${crypto.currency.trim() || "Crypto"} · ${crypto.network.trim()} · ${shorten(crypto.walletAddress.trim())}`
      : `${bank.bankName.trim()} · ${mask(bank.accountNumber.trim())}`

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Withdraw{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              funds.
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-secondary-600 sm:text-base">
            Send money from your available balance to a crypto wallet or bank account. Each request
            is checked by our team before it is paid.
          </p>
        </div>
        {limits && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-secondary-200 bg-white px-3 py-1.5 text-xs font-semibold text-secondary-700 shadow-sm tabular-nums">
              Fee {formatMoney(limits.feePercent, { bare: true })}%
            </span>
            <span className="inline-flex items-center rounded-full border border-secondary-200 bg-white px-3 py-1.5 text-xs font-semibold text-secondary-700 shadow-sm tabular-nums">
              Minimum {formatMoney(limits.minimum)}
            </span>
          </div>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        {/* Form */}
        <form onSubmit={review} noValidate className={cn(card, "min-w-0 divide-y divide-secondary-200")}>
          <Step number={1} title="Where should we send it?">
            <div role="radiogroup" aria-label="Withdrawal method" className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "CRYPTO", label: "Crypto wallet", blurb: "USDT, BTC, ETH…", icon: Bitcoin },
                  { value: "BANK", label: "Bank account", blurb: "Wire transfer", icon: Banknote },
                ] as const
              ).map((option) => {
                const active = method === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setMethod(option.value)
                      setFieldErrors({})
                    }}
                    className={cn(
                      "relative flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all",
                      focusRing,
                      active
                        ? "border-primary-600 bg-primary-50/70 ring-1 ring-primary-600"
                        : "border-secondary-200 bg-white hover:border-primary-300"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-xl",
                        active ? "bg-primary-700 text-white" : "bg-secondary-100 text-secondary-600"
                      )}
                    >
                      <option.icon aria-hidden className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="block truncate text-xs text-secondary-500">{option.blurb}</span>
                    </span>
                    {active && <CheckCircle2 aria-hidden className="absolute top-3 right-3 size-4.5 text-primary-700" />}
                  </button>
                )
              })}
            </div>
          </Step>

          <Step number={2} title={method === "CRYPTO" ? "Wallet details" : "Bank details"}>
            {method === "CRYPTO" ? (
              <div className="space-y-4">
                <ChipField
                  label="Currency"
                  optional
                  options={CURRENCIES}
                  value={crypto.currency}
                  onChange={(value) => setCrypto((c) => ({ ...c, currency: value }))}
                  placeholder="Other currency"
                />
                <ChipField
                  label="Network"
                  options={NETWORKS}
                  value={crypto.network}
                  onChange={(value) => setCrypto((c) => ({ ...c, network: value }))}
                  placeholder="Other network"
                  error={fieldErrors.network}
                />
                <Input
                  id="withdraw-wallet"
                  label="Wallet address"
                  placeholder="Paste the destination address"
                  value={crypto.walletAddress}
                  onChange={(event) => setCrypto((c) => ({ ...c, walletAddress: event.target.value }))}
                  error={fieldErrors.walletAddress}
                  className="font-mono"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  Check the address and network match your wallet. Crypto sent to the wrong address
                  or network cannot be recovered.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    id="withdraw-bank-name"
                    label="Bank name"
                    value={bank.bankName}
                    onChange={(event) => setBank((b) => ({ ...b, bankName: event.target.value }))}
                    error={fieldErrors.bankName}
                  />
                  <Input
                    id="withdraw-account-name"
                    label="Account holder"
                    value={bank.accountName}
                    onChange={(event) => setBank((b) => ({ ...b, accountName: event.target.value }))}
                    error={fieldErrors.accountName}
                    autoComplete="name"
                  />
                </div>
                <Input
                  id="withdraw-account-number"
                  label="Account number or IBAN"
                  value={bank.accountNumber}
                  onChange={(event) => setBank((b) => ({ ...b, accountNumber: event.target.value }))}
                  error={fieldErrors.accountNumber}
                  className="font-mono"
                  autoComplete="off"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    id="withdraw-routing"
                    label="Routing / sort code"
                    optional
                    value={bank.routingNumber}
                    onChange={(event) => setBank((b) => ({ ...b, routingNumber: event.target.value }))}
                    className="font-mono"
                  />
                  <Input
                    id="withdraw-swift"
                    label="SWIFT / BIC"
                    optional
                    value={bank.swiftCode}
                    onChange={(event) => setBank((b) => ({ ...b, swiftCode: event.target.value }))}
                    className="font-mono uppercase"
                  />
                </div>
              </div>
            )}
          </Step>

          <Step number={3} title="How much?">
            <div className="space-y-3">
              <Input
                id="withdraw-amount"
                label="Amount you'll receive (USD)"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                error={fieldErrors.amount}
                hint={limits ? `The ${formatMoney(limits.feePercent, { bare: true })}% fee is added on top and taken from your balance.` : "Loading limits…"}
              />
              {maxCents > 0 && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "25%", value: Math.floor(maxCents / 4) },
                    { label: "50%", value: Math.floor(maxCents / 2) },
                    { label: "Max", value: maxCents },
                  ]
                    .filter((pick) => pick.value >= minimumCents)
                    .map((pick) => (
                      <button
                        key={pick.label}
                        type="button"
                        onClick={() => setAmountCents(pick.value)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                          focusRing,
                          amountCents === pick.value
                            ? "border-primary-600 bg-primary-50 text-primary-700"
                            : "border-secondary-200 text-secondary-600 hover:border-primary-300 hover:text-primary-700"
                        )}
                      >
                        {pick.label} · {formatMoney(fromCents(pick.value))}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <dl className="mt-5 divide-y divide-secondary-100 rounded-2xl border border-secondary-200 bg-secondary-50/60 text-sm">
              <Row label="You receive" value={formatMoney(fromCents(amountCents))} strong />
              <Row
                label={`Processing fee${limits ? ` (${formatMoney(limits.feePercent, { bare: true })}%)` : ""}`}
                value={`+${formatMoney(fromCents(feeCents))}`}
              />
              <Row label="Taken from your balance" value={formatMoney(fromCents(totalCents))} strong />
              <Row
                label="Available after"
                value={formatMoney(fromCents(afterCents))}
                tone={afterCents < 0 ? "text-red-600" : undefined}
              />
            </dl>

            <Button type="submit" size="lg" className="mt-5 w-full" disabled={!limits || !summary}>
              <Lock aria-hidden />
              Review and enter PIN
            </Button>
          </Step>
        </form>

        {/* Side */}
        <aside className="space-y-6 lg:sticky lg:top-24">
          <section
            aria-labelledby="balance-title"
            className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-6 text-white shadow-xl shadow-primary-900/15"
          >
            <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 -z-10 size-56 rounded-full bg-sky-400/20 blur-3xl" />
            <h3 id="balance-title" className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">
              <Wallet aria-hidden className="size-4" /> Available to withdraw
            </h3>
            {portfolio.loading && !summary ? (
              <Skeleton className="mt-3 h-10 w-44 bg-white/10" />
            ) : (
              <p className="mt-2 font-heading text-4xl font-medium tracking-tight tabular-nums">
                {formatMoney(summary?.available)}
              </p>
            )}
            {limits && maxCents > 0 && (
              <p className="mt-1 text-xs text-primary-100 tabular-nums">
                Up to {formatMoney(fromCents(maxCents))} after the fee
              </p>
            )}

            <dl className="mt-5 space-y-2.5 border-t border-white/15 pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-primary-100">Reserved for requests</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(summary?.reserved)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-primary-100">In active plans</dt>
                <dd className="font-semibold tabular-nums">{formatMoney(summary?.inPlans)}</dd>
              </div>
            </dl>
            {summary && toCents(summary.inPlans) > 0 && (
              <p className="mt-3 text-xs leading-relaxed text-primary-100">
                Money in a plan comes back to your available balance when the plan ends.{" "}
                <Link href="/plans" className="font-semibold text-white underline underline-offset-2">
                  View plans
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="pin-title" className={cn(card, "p-5")}>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                <KeyRound aria-hidden className="size-5" />
              </span>
              <div>
                <h3 id="pin-title" className="font-sans text-sm font-semibold">
                  You&apos;ll need a withdrawal PIN
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-secondary-600">
                  Your account manager issues a 6-digit PIN. It works once and expires, which keeps
                  your money safe even if someone learns your password.
                </p>
              </div>
            </div>
            {pinHelp ? (
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="mt-4 w-full border border-secondary-300 text-secondary-800 hover:border-primary-300 hover:bg-white hover:text-primary-700"
              >
                <a href={pinHelp}>
                  Request a PIN <ArrowRight aria-hidden />
                </a>
              </Button>
            ) : (
              <p className="mt-3 text-xs text-secondary-500">Ask your account manager for one.</p>
            )}
          </section>

          <section aria-labelledby="flow-title" className={cn(card, "p-5")}>
            <h3 id="flow-title" className="font-sans text-sm font-semibold">
              How a withdrawal works
            </h3>
            <ol className="mt-4 space-y-4">
              {[
                { icon: Lock, title: "Funds are reserved", body: "The amount plus the fee is set aside." },
                { icon: ShieldCheck, title: "Our team reviews it", body: "You can cancel while it's pending." },
                { icon: Send, title: "Payment is sent", body: "We email you when it's on its way." },
              ].map((step, index, list) => (
                <li key={step.title} className="relative flex gap-3">
                  {index < list.length - 1 && (
                    <span aria-hidden className="absolute top-9 bottom-[-1rem] left-4 w-px bg-secondary-200" />
                  )}
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-700 ring-1 ring-primary-100">
                    <step.icon aria-hidden className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{step.title}</p>
                    <p className="text-sm text-secondary-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {/* History */}
      <section aria-labelledby="requests-title" className={cn(card, "p-5 sm:p-6")}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id="requests-title" className="font-sans text-base font-semibold">
            Your withdrawals
          </h3>
          {pending.length > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              {pending.length} pending
            </span>
          )}
        </div>

        {history.error && !history.data ? (
          <ErrorState title="Could not load your withdrawals" onRetry={history.reload} className="py-8" />
        ) : history.loading && !history.data ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : withdrawals.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-6 py-10 text-center">
            <span className="grid size-11 place-items-center rounded-full bg-white text-secondary-400 ring-1 ring-secondary-200">
              <Wallet aria-hidden className="size-5" />
            </span>
            <p className="mt-3 font-semibold">No withdrawals yet</p>
            <p className="mt-1 max-w-xs text-sm text-secondary-600">
              Requests you make appear here, from review to payment.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-secondary-100">
            {withdrawals.map((request) => (
              <HistoryRow key={request.id} request={request} onCancel={() => setCancelling(request)} />
            ))}
          </ul>
        )}
      </section>

      {/* Confirm with PIN */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={(next) => !submitting && setConfirming(next)}
        title="Confirm your withdrawal"
        description="Enter the 6-digit PIN from your account manager to send this request for review."
        confirmLabel="Request withdrawal"
        onConfirm={() => void submit()}
        busy={submitting}
      >
        <div className="space-y-4">
          <dl className="divide-y divide-secondary-100 rounded-2xl border border-secondary-200 bg-secondary-50/60 text-sm">
            <Row label="To" value={destinationSummary} />
            <Row label="You receive" value={formatMoney(fromCents(amountCents))} strong />
            <Row label="Fee" value={`+${formatMoney(fromCents(feeCents))}`} />
            <Row label="Taken from your balance" value={formatMoney(fromCents(totalCents))} strong />
          </dl>

          <PinInput value={pin} onChange={setPin} disabled={submitting} error={pinError} autoFocus />

          <p className="text-xs text-secondary-500">
            A wrong PIN is not used up. No PIN yet?{" "}
            {pinHelp ? (
              <a href={pinHelp} className="font-semibold text-primary-700 underline underline-offset-2">
                Request one
              </a>
            ) : (
              "Ask your account manager."
            )}
          </p>
        </div>
      </ConfirmDialog>

      {/* Cancel */}
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(next) => !cancelBusy && !next && setCancelling(null)}
        title="Cancel this withdrawal?"
        description={
          cancelling && (
            <>
              The reserved {formatMoney(fromCents(toCents(cancelling.amount) + toCents(cancelling.fee)))}{" "}
              returns to your available balance straight away. To withdraw later you&apos;ll need
              a new request and a new PIN.
            </>
          )
        }
        confirmLabel="Cancel request"
        cancelLabel="Keep it"
        tone="danger"
        busy={cancelBusy}
        onConfirm={() => void cancel()}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- pieces */

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
    <section aria-labelledby={`wstep-${number}`} className="p-5 sm:p-7">
      <h3 id={`wstep-${number}`} className="mb-4 flex items-center gap-3 font-sans text-base font-semibold">
        <span className="grid size-7 place-items-center rounded-full border border-primary-200 bg-primary-50 text-xs font-semibold text-primary-700 tabular-nums">
          {number}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Common values as chips, with a free-text field for anything else. */
function ChipField({
  label,
  options,
  value,
  onChange,
  placeholder,
  optional = false,
  error,
}: {
  label: string
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  optional?: boolean
  error?: string
}) {
  const custom = value !== "" && !options.includes(value)
  const id = `chip-${label.toLowerCase()}`

  return (
    <div>
      <p id={id} className="mb-2 text-sm font-medium text-secondary-700">
        {label}
        {optional && <span className="ml-1.5 text-xs font-normal text-secondary-400">optional</span>}
      </p>
      <div role="group" aria-labelledby={id} className="flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(value === option ? "" : option)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              focusRing,
              value === option
                ? "border-primary-700 bg-primary-700 text-white"
                : "border-secondary-200 bg-white text-secondary-700 hover:border-primary-300"
            )}
          >
            {option}
          </button>
        ))}
        <input
          aria-label={`${label}, other`}
          value={custom ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-8 w-36 rounded-full border bg-white px-3.5 text-xs placeholder:text-secondary-400 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 focus:outline-none",
            custom ? "border-primary-600" : "border-secondary-200"
          )}
        />
      </div>
      {error && <p role="alert" className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function Row({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="shrink-0 text-secondary-600">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right tabular-nums", strong ? "font-semibold text-secondary-900" : "font-medium text-secondary-800", tone)}>
        {value}
      </dd>
    </div>
  )
}

const STATUS_ICON: Record<WithdrawalRequest["status"], { icon: LucideIcon; tone: string }> = {
  PENDING: { icon: Clock, tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  APPROVED: { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  REJECTED: { icon: XCircle, tone: "bg-red-50 text-red-600 ring-red-100" },
  CANCELLED: { icon: XCircle, tone: "bg-secondary-100 text-secondary-500 ring-secondary-200" },
}

function HistoryRow({
  request,
  onCancel,
}: {
  request: WithdrawalRequest
  onCancel: () => void
}) {
  const status = STATUS_ICON[request.status] ?? STATUS_ICON.PENDING
  const destination =
    request.method === "CRYPTO"
      ? (() => {
          const d = request.destination as CryptoDestination
          return `${d.currency ?? "Crypto"} · ${d.network} · ${shorten(d.walletAddress)}`
        })()
      : (() => {
          const d = request.destination as BankDestination
          return `${d.bankName} · ${mask(d.accountNumber)}`
        })()

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full ring-1", status.tone)}>
          <status.icon aria-hidden className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            <span className="tabular-nums">{formatMoney(request.amount)}</span>
            <span className="ml-2 font-normal text-secondary-500">
              + {formatMoney(request.fee)} fee
            </span>
          </p>
          <p className="truncate text-xs text-secondary-500">
            {destination} · {formatDateTime(request.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {request.status === "PENDING" && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2 py-1 text-xs font-semibold text-secondary-500 transition-colors outline-none hover:bg-red-50 hover:text-red-600 focus-visible:ring-4 focus-visible:ring-red-100"
            >
              Cancel
            </button>
          )}
          <StatusBadge status={request.status} />
        </div>
      </div>
      {request.reviewNote && (
        <p className="mt-2.5 ml-[3.25rem] rounded-xl bg-secondary-50 px-3 py-2 text-sm text-secondary-600">
          <span className="font-semibold text-secondary-800">Note from our team:</span> {request.reviewNote}
        </p>
      )}
    </li>
  )
}

/** `0x12ab…9f3c` */
function shorten(address: string) {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address
}

/** `•••• 6789` */
function mask(account: string) {
  return account.length > 4 ? `•••• ${account.slice(-4)}` : account
}
