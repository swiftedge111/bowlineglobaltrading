"use client"

import { useState } from "react"
import Link from "next/link"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Ban,
  CheckCircle2,
  Clock,
  Coins,
  KeyRound,
  Layers,
  Loader2,
  Mail,
  MailCheck,
  MailWarning,
  MessageCircle,
  MinusCircle,
  Phone,
  PlusCircle,
  ReceiptText,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ErrorState } from "@/components/app/empty-state"
import { StatusBadge } from "@/components/app/status-badge"
import { CopyButton } from "@/components/ui/copy-button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import * as api from "@/lib/api/endpoints"
import type {
  AdminUserDetail,
  HoldingSummary,
  IssuedPin,
  ReceiptLink,
  TxCategory,
} from "@/lib/api/types"
import { findCountry } from "@/lib/countries"
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  formatUnits,
  humanise,
  initials,
  isZero,
} from "@/lib/format"
import { useAsyncData } from "@/lib/use-async-data"
import { countdown, useNow } from "@/lib/use-now"
import { cn } from "@/lib/utils"

type Direction = "credit" | "debit"

type ActivityTab = "transactions" | "plans" | "holdings"

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing = "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

/**
 * What an admin may write by hand — mirrors ADJUSTABLE_CATEGORIES on the API.
 *
 * Direction and category are two separate columns on the ledger. The button
 * decides `type` (money in or out); this list decides `category` (the reason
 * printed on the user's statement). Both directions are valid for every entry
 * here — a credit records the thing, a debit reverses it — so each carries two
 * labels. "Debit + Profit" reads as a contradiction until it is spelled out as
 * "reverse a profit", which is exactly what it is.
 */
const CATEGORY_OPTIONS: ReadonlyArray<{
  value: TxCategory
  credit: string
  debit: string
  /** Dashboard figure this moves on top of the balance, if any. */
  affects: string | null
}> = [
  {
    value: "ADJUSTMENT",
    credit: "Adjustment — balance only",
    debit: "Correction — balance only",
    affects: null,
  },
  {
    value: "DEPOSIT",
    credit: "Deposit",
    debit: "Reverse a deposit",
    affects: "Invested capital",
  },
  {
    value: "HOLDING",
    credit: "Holding value",
    debit: "Reverse a holding credit",
    affects: "Invested capital",
  },
  {
    value: "PROFIT",
    credit: "Profit",
    debit: "Reverse a profit",
    affects: "Profit earned",
  },
  {
    value: "PLAN_PAYOUT",
    credit: "Plan payout",
    debit: "Reverse a plan payout",
    affects: "Profit earned",
  },
]

/**
 * One client: who they are, what they hold, what is waiting on the desk, and
 * the actions that change their account. Every action opens a dialog that
 * spells out its effect before anything is written.
 */
export function AdminUserDetailScreen({ uid }: { uid: string }) {
  const toast = useToast()
  const detail = useAsyncData(() => api.admin.user(uid), `admin-user:${uid}`)
  const now = useNow(60_000)
  const [tab, setTab] = useState<ActivityTab>("transactions")

  const [adjustOpen, setAdjustOpen] = useState<Direction | null>(null)
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<TxCategory>("ADJUSTMENT")
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)

  const [statusOpen, setStatusOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  const [pinOpen, setPinOpen] = useState(false)
  const [pinLength, setPinLength] = useState<4 | 6>(6)
  const [pinBusy, setPinBusy] = useState(false)
  /** Emailing the PIN is opt-in per issue, so a routine one never goes out to a
      stale address by default and the admin makes the call each time. */
  const [pinNotify, setPinNotify] = useState(false)
  /** Storing a readable copy of the PIN is opt-in too — without this the bcrypt
      hash stays the only copy that exists anywhere. */
  const [pinShare, setPinShare] = useState(false)
  const [issued, setIssued] = useState<IssuedPin | null>(null)

  const [holdingOpen, setHoldingOpen] = useState(false)
  const [holding, setHolding] = useState({
    name: "",
    symbol: "",
    units: "",
    valueUsd: "",
    // On by default: most positions recorded here are money the user actually
    // sent — a manual bank transfer or wallet payment they expect the desk to
    // book for them. Recording the asset without the cash was the wrong
    // default, and left the balance disagreeing with what they had paid.
    creditLedger: true,
  })
  const [holdingBusy, setHoldingBusy] = useState(false)
  const [removing, setRemoving] = useState<HoldingSummary | null>(null)
  const [reverseHolding, setReverseHolding] = useState(true)
  const [notifyHolding, setNotifyHolding] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)

  const [receipt, setReceipt] = useState<ReceiptLink | null>(null)
  /** Holds the id of the transaction whose receipt is being minted, not a bool:
      the spinner belongs on the row that was clicked, not on all of them. */
  const [receiptBusy, setReceiptBusy] = useState<string | null>(null)

  const data = detail.data

  function openAdjust(direction: Direction) {
    // Reset everything. The category persisted across openings, so switching
    // Credit → Debit kept the previous reason on screen and made "Adjustment"
    // look like it was itself the direction.
    setAmount("")
    setDescription("")
    setCategory("ADJUSTMENT")
    // Credit notifies by default, debit does not — money arriving is news the
    // user wants, money leaving is usually a correction being made moments
    // later. Reset per opening either way, so a choice made about the last
    // entry never carries silently into this one.
    setNotify(direction === "credit")
    setAdjustOpen(direction)
  }

  /**
   * Idempotent on the server, so a double click cannot mint a second reference
   * for the same payment — it returns the receipt that already exists.
   */
  async function openReceipt(transactionId: string) {
    setReceiptBusy(transactionId)
    try {
      const result = await api.admin.issueReceipt(transactionId)
      setReceipt(result.receipt)
    } catch (cause) {
      toast.fromError(cause, "Could not create the receipt.")
    } finally {
      setReceiptBusy(null)
    }
  }

  async function submitAdjustment() {
    if (!adjustOpen) return
    const numeric = Number(amount)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      toast.error("Enter an amount greater than zero.")
      return
    }

    setBusy(true)
    try {
      await api.admin.adjust(uid, {
        direction: adjustOpen,
        amount: numeric,
        category,
        description: description.trim() || undefined,
        notify,
      })
      toast.success(
        adjustOpen === "credit" ? "Account credited" : "Account debited"
      )
      setAdjustOpen(null)
      setAmount("")
      setDescription("")
      detail.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not adjust the balance.")
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus() {
    if (!data) return
    const next = data.user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"
    setStatusBusy(true)
    try {
      await api.admin.setUserStatus(uid, next)
      toast.success(next === "ACTIVE" ? "Account activated" : "Account suspended")
      setStatusOpen(false)
      detail.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not change the account status.")
    } finally {
      setStatusBusy(false)
    }
  }

  async function issuePin() {
    setPinBusy(true)
    try {
      const result = await api.admin.issuePin(uid, {
        length: pinLength,
        ttlMinutes: 1440,
        notifyUser: pinNotify,
        shareLink: pinShare,
      })
      // Show the raw PIN only in the result of this action.
      setIssued(result)
      setPinOpen(false)
    } catch (cause) {
      toast.fromError(cause, "Could not issue a PIN.")
    } finally {
      setPinBusy(false)
    }
  }

  async function addHolding() {
    const units = Number(holding.units)
    const value = Number(holding.valueUsd)
    if (!holding.name.trim() || !holding.symbol.trim()) {
      toast.error("Enter a name and symbol.")
      return
    }
    if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(value) || value <= 0) {
      toast.error("Units and value must be greater than zero.")
      return
    }

    setHoldingBusy(true)
    try {
      await api.admin.addHolding(uid, {
        name: holding.name.trim(),
        symbol: holding.symbol.trim().toUpperCase(),
        units,
        valueUsd: value,
        creditLedger: holding.creditLedger,
      })
      toast.success("Holding added")
      setHoldingOpen(false)
      setHolding({
        name: "",
        symbol: "",
        units: "",
        valueUsd: "",
        creditLedger: true,
      })
      detail.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not add the holding.")
    } finally {
      setHoldingBusy(false)
    }
  }

  async function removeHolding() {
    if (!removing) return
    setRemoveBusy(true)
    try {
      const result = await api.admin.archiveHolding(
        removing.id,
        reverseHolding,
        reverseHolding && notifyHolding
      )
      toast.success(
        "Holding removed",
        result.reversed
          ? "The credit it added has been reversed."
          : "The balance was left as it is."
      )
      setRemoving(null)
      detail.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not remove the holding.")
    } finally {
      setRemoveBusy(false)
    }
  }

  if (detail.error && !data) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <BackLink />
        <ErrorState
          title="Could not load this client"
          description="The account ID may not exist."
          onRetry={detail.reload}
        />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <BackLink />
        <Skeleton className="h-64 w-full rounded-[1.5rem]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-[1.5rem]" />
      </div>
    )
  }

  const suspended = data.user.status === "SUSPENDED"
  const { user } = data
  const residence = findCountry(user.country ?? undefined)
  const signupCountry = findCountry(user.signupCountry ?? undefined)
  // Worth a second look, not proof of anything: VPNs and travel both do this.
  const countryMismatch =
    user.country && user.signupCountry && user.country.toUpperCase() !== user.signupCountry.toUpperCase()
  const pendingCount = data.pending.deposits.length + data.pending.withdrawals.length
  const activeTab: ActivityTab = tab

  const holdingValue = Number(holding.valueUsd)
  const holdingValueLabel =
    Number.isFinite(holdingValue) && holdingValue > 0
      ? `$${holdingValue.toFixed(2)}`
      : "its value"

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <BackLink />

      {/* Who, and what they hold */}
      <section
        aria-labelledby="client-name"
        className="relative isolate overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-5 text-white shadow-xl shadow-primary-900/15 sm:p-7"
      >
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-sky-400/20 blur-3xl" />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className={cn(
                "grid size-14 shrink-0 place-items-center rounded-2xl text-lg font-bold ring-1 sm:size-16",
                suspended ? "bg-red-500/20 text-red-100 ring-red-300/40" : "bg-white/10 text-white ring-white/20"
              )}
            >
              {initials(user.fullName)}
            </span>
            <div className="min-w-0">
              <h2 id="client-name" className="truncate text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                {user.fullName}
              </h2>
              <p className="truncate text-sm text-primary-100">{user.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <HeroChip tone={suspended ? "bad" : "good"}>
                  {suspended ? <Ban aria-hidden className="size-3.5" /> : <CheckCircle2 aria-hidden className="size-3.5" />}
                  {suspended ? "Suspended" : "Active"}
                </HeroChip>
                <HeroChip tone={user.emailVerified ? "plain" : "warn"}>
                  {user.emailVerified ? <MailCheck aria-hidden className="size-3.5" /> : <MailWarning aria-hidden className="size-3.5" />}
                  {user.emailVerified ? "Email verified" : "Email not verified"}
                </HeroChip>
                {user.role === "ADMIN" && (
                  <HeroChip tone="plain">
                    <ShieldCheck aria-hidden className="size-3.5" /> Admin
                  </HeroChip>
                )}
                {residence && (
                  <HeroChip tone="plain">
                    <span aria-hidden>{residence.flag}</span> {residence.name}
                  </HeroChip>
                )}
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-primary-100">
                <span className="inline-flex items-center gap-1">
                  ID <span className="font-mono font-semibold text-white">{user.uid}</span>
                  <CopyButton value={user.uid} label="Copy account ID" className="p-1 text-primary-100 hover:bg-white/10 hover:text-white" />
                </span>
                <span>Joined {formatDate(user.createdAt)}</span>
                <span>{user.lastLoginAt ? `Seen ${formatRelative(user.lastLoginAt)}` : "Never signed in"}</span>
              </p>
            </div>
          </div>

          <div className="shrink-0 lg:text-right">
            <p className="text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">Account value</p>
            <p className="mt-1 font-heading text-4xl font-medium tracking-tight tabular-nums sm:text-5xl">
              {formatMoney(data.balance.accountValue)}
            </p>
            <p className="mt-1 text-xs text-primary-100">Cash plus principal in active plans</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-4">
          <HeroFigure label="Cash balance" value={data.balance.balance} />
          <HeroFigure label="Available" value={data.balance.available} />
          <HeroFigure label="In plans" value={data.balance.inPlans} />
          <HeroFigure label="Reserved" value={data.balance.reserved} hint="Pending withdrawals" />
        </dl>
      </section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ActionButton icon={PlusCircle} label="Credit" tone="primary" onClick={() => openAdjust("credit")} />
        <ActionButton icon={MinusCircle} label="Debit" onClick={() => openAdjust("debit")} />
        <ActionButton
          icon={KeyRound}
          label="Issue PIN"
          onClick={() => {
            setPinNotify(false)
            setPinShare(false)
            setPinOpen(true)
          }}
        />
        <ActionButton
          icon={suspended ? ShieldCheck : ShieldOff}
          label={suspended ? "Activate" : "Suspend"}
          tone={suspended ? "good" : "danger"}
          onClick={() => setStatusOpen(true)}
        />
      </div>

      {/* Waiting on the desk */}
      {pendingCount > 0 && (
        <section aria-labelledby="pending-title" className="rounded-[1.5rem] border border-amber-200 bg-amber-50/70 p-5">
          <h3 id="pending-title" className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <Clock aria-hidden className="size-4 text-amber-600" />
            {pendingCount === 1 ? "1 request waiting for review" : `${pendingCount} requests waiting for review`}
          </h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.pending.deposits.map((request) => (
              <PendingRow
                key={request.id}
                href="/admin/deposits"
                icon={ArrowDownToLine}
                title={`Deposit of ${formatMoney(request.amount)}`}
                detail={`${humanise(request.method)} · ${formatRelative(request.createdAt)}`}
              />
            ))}
            {data.pending.withdrawals.map((request) => (
              <PendingRow
                key={request.id}
                href="/admin/withdrawals"
                icon={ArrowUpFromLine}
                title={`Withdrawal of ${formatMoney(request.amount)}`}
                detail={`${humanise(request.method)} · +${formatMoney(request.fee)} fee · ${formatRelative(request.createdAt)}`}
              />
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* Lifetime */}
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            <Lifetime label="Deposited" value={data.lifetime.deposited} />
            <Lifetime label="Withdrawn" value={data.lifetime.withdrawn} />
            <Lifetime label="Earned" value={data.lifetime.earned} tone="good" />
          </dl>

          {/* Activity */}
          <section className={cn(card, "min-w-0 overflow-hidden")}>
            <div className="flex items-center justify-between gap-3 border-b border-secondary-200 px-3 pt-3 sm:px-5">
              <div role="tablist" aria-label="Activity" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
                {(
                  [
                    { key: "transactions", label: "Transactions", count: data.recentTransactions.length },
                    { key: "plans", label: "Plans", count: data.subscriptions.length },
                    { key: "holdings", label: "Holdings", count: data.holdings.length },
                  ] as const
                ).map((item) => {
                  const selected = activeTab === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setTab(item.key)}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
                        focusRing,
                        selected ? "border-primary-600 text-primary-700" : "border-transparent text-secondary-500 hover:text-secondary-800"
                      )}
                    >
                      {item.label}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                          selected ? "bg-primary-50 text-primary-700" : "bg-secondary-100 text-secondary-600"
                        )}
                      >
                        {item.count}
                      </span>
                    </button>
                  )
                })}
              </div>
              {activeTab === "holdings" && (
                <button
                  type="button"
                  onClick={() => setHoldingOpen(true)}
                  className={cn(
                    "mb-2 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-secondary-200 px-3 py-1.5 text-xs font-semibold text-secondary-700 hover:border-primary-300 hover:text-primary-700",
                    focusRing
                  )}
                >
                  <PlusCircle aria-hidden className="size-3.5" /> Add
                </button>
              )}
            </div>

            <div className="p-4 sm:p-5">
              {activeTab === "transactions" &&
                (data.recentTransactions.length === 0 ? (
                  <EmptyPanel icon={ReceiptText} text="No money has moved on this account yet." />
                ) : (
                  <>
                    <ul className="divide-y divide-secondary-100">
                      {data.recentTransactions.map((tx) => (
                        <TransactionRow
                          key={tx.id}
                          tx={tx}
                          busy={receiptBusy === tx.id}
                          disabled={receiptBusy !== null}
                          onReceipt={() => void openReceipt(tx.id)}
                        />
                      ))}
                    </ul>
                    {data.recentTransactions.length >= 20 && (
                      <p className="mt-3 text-center text-xs text-secondary-500">Showing the latest 20.</p>
                    )}
                  </>
                ))}

              {activeTab === "plans" &&
                (data.subscriptions.length === 0 ? (
                  <EmptyPanel icon={Coins} text="This client has not started a plan." />
                ) : (
                  <ul className="space-y-3">
                    {data.subscriptions.map((sub) => (
                      <PlanRow key={sub.id} sub={sub} now={now} />
                    ))}
                  </ul>
                ))}

              {activeTab === "holdings" &&
                (data.holdings.length === 0 ? (
                  <EmptyPanel icon={Layers} text="No positions recorded. Add one to show it on their dashboard." />
                ) : (
                  <ul className="space-y-2">
                    {data.holdings.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-secondary-200 p-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-[11px] font-bold text-primary-700 ring-1 ring-primary-100">
                          {item.symbol.slice(0, 4).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{item.name}</p>
                          <p className="text-xs text-secondary-500 tabular-nums">
                            {formatUnits(item.units)} {item.symbol.toUpperCase()} · added {formatDate(item.createdAt)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">{formatMoney(item.valueUsd)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            // Reset alongside the target, for the same reason the
                            // adjustment category resets: a choice made about the last
                            // position must not silently carry into this one.
                            setReverseHolding(true)
                            setNotifyHolding(false)
                            setRemoving(item)
                          }}
                          aria-label={`Remove ${item.name}`}
                          className={cn("shrink-0 rounded-lg p-2 text-secondary-400 transition-colors hover:bg-red-50 hover:text-red-600", focusRing)}
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          </section>
        </div>

        {/* Side: how to reach them, and where they came from */}
        <aside className="min-w-0 space-y-6">
          <section aria-labelledby="contact-title" className={cn(card, "p-5")}>
            <h3 id="contact-title" className="text-sm font-semibold">Contact</h3>
            <ul className="mt-3 space-y-2">
              <ContactRow icon={Mail} label="Email" value={user.email} href={`mailto:${user.email}`} />
              {user.phone && <ContactRow icon={Phone} label="Phone" value={formatPhone(user.phone)} href={`tel:${user.phone}`} />}
              {user.contactPhone && (
                <ContactRow
                  icon={MessageCircle}
                  label="WhatsApp / Telegram"
                  value={formatPhone(user.contactPhone)}
                  href={`https://wa.me/${user.contactPhone.replace(/\D/g, "")}`}
                  external
                />
              )}
            </ul>
          </section>

          <section aria-labelledby="identity-title" className={cn(card, "p-5")}>
            <h3 id="identity-title" className="text-sm font-semibold">Identity and sign-in</h3>
            <dl className="mt-2 divide-y divide-secondary-100 text-sm">
              <Fact label="Username" value={`@${user.username}`} />
              <Fact label="Lives in" value={residence ? `${residence.flag} ${residence.name}` : "Not given"} />
              <Fact
                label="Signed up from"
                value={user.signupIp ? displayIp(user.signupIp) : "Unknown"}
                sub={signupCountry ? `${signupCountry.flag} ${signupCountry.name} (approximate)` : undefined}
                mono={Boolean(user.signupIp) && displayIp(user.signupIp ?? "") !== "Local"}
              />
              <Fact label="Last IP" value={user.lastLoginIp ? displayIp(user.lastLoginIp) : "None yet"} mono={Boolean(user.lastLoginIp) && displayIp(user.lastLoginIp ?? "") !== "Local"} />
              <Fact label="Last seen" value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"} />
              <Fact label="Joined" value={formatDateTime(user.createdAt)} />
            </dl>
            {countryMismatch && (
              <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
                <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                Signed up from {signupCountry?.name ?? user.signupCountry} but lists {residence?.name ?? user.country} as home.
                Often a VPN or travel; worth a look before a large withdrawal.
              </p>
            )}
          </section>
        </aside>
      </div>

      {/* ---- dialogs ---- */}

      <ConfirmDialog
        open={adjustOpen !== null}
        onOpenChange={(next) => !busy && !next && setAdjustOpen(null)}
        title={
          adjustOpen === "credit" ? "Credit this account" : "Debit this account"
        }
        description={
          adjustOpen === "credit"
            ? "Money in. Raises the balance and appears on the user's statement."
            : "Money out. Lowers the balance and appears on the user's statement."
        }
        confirmLabel={adjustOpen === "credit" ? "Credit" : "Debit"}
        tone={adjustOpen === "debit" ? "danger" : "default"}
        busy={busy}
        onConfirm={() => void submitAdjustment()}
      >
        <div className="space-y-3">
          <Input
            id="adjust-amount"
            label="Amount (USD)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={busy}
          />
          <div>
            <label
              htmlFor="adjust-category"
              className="mb-2 block text-sm font-medium text-secondary-700"
            >
              {adjustOpen === "credit"
                ? "What is this for?"
                : "What are you reversing?"}
            </label>
            <select
              id="adjust-category"
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value as TxCategory)}
              className="h-11 w-full rounded-xl border border-secondary-200 bg-white px-3 text-sm outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {adjustOpen === "credit" ? option.credit : option.debit}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-secondary-500">
              Direction is already set by the button you clicked. This only
              labels the reason, and which dashboard figure moves with it.
            </p>
          </div>
          <Input
            id="adjust-description"
            label="Description"
            optional
            placeholder="Shown on the user's transaction list"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={busy}
          />
          <label className={optionClass}>
            <input
              type="checkbox"
              checked={notify}
              disabled={busy}
              onChange={(event) => setNotify(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
            />
            <span className="text-sm text-secondary-700">
              {adjustOpen === "credit"
                ? "Email the user about this credit"
                : "Email the user about this debit"}
              <span className="mt-0.5 block text-xs text-secondary-500">
                {notify
                  ? adjustOpen === "debit"
                    ? "They get a notice with the amount, the reason you typed, and how to query it."
                    : category === "PROFIT" || category === "PLAN_PAYOUT"
                      ? "They get the profit notice with the amount and their new balance."
                      : "They get a notice with the amount and their new balance."
                  : "Nothing is sent. Use this for correcting your own mistake."}
              </span>
            </span>
          </label>

          <AdjustmentEffect
            direction={adjustOpen}
            category={category}
            amount={amount}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={statusOpen}
        onOpenChange={(next) => !statusBusy && setStatusOpen(next)}
        title={suspended ? "Activate this account?" : "Suspend this account?"}
        description={
          suspended
            ? "The user will be able to sign in and transact again."
            : "The user will be blocked from signing in. Existing balances are untouched."
        }
        confirmLabel={suspended ? "Activate" : "Suspend"}
        tone={suspended ? "default" : "danger"}
        busy={statusBusy}
        onConfirm={() => void toggleStatus()}
      />

      <ConfirmDialog
        open={pinOpen}
        onOpenChange={(next) => !pinBusy && setPinOpen(next)}
        title="Issue a withdrawal PIN"
        description="The PIN is shown once, here. It cannot be retrieved afterwards — copy it before closing."
        confirmLabel="Issue PIN"
        busy={pinBusy}
        onConfirm={() => void issuePin()}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-secondary-700">
            Length
          </legend>
          <div className="flex gap-2">
            {([4, 6] as const).map((length) => (
              <button
                key={length}
                type="button"
                onClick={() => setPinLength(length)}
                aria-pressed={pinLength === length}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold",
                  focusRing,
                  pinLength === length
                    ? "bg-primary-700 text-white"
                    : "border border-secondary-200 text-secondary-700 hover:border-primary-300"
                )}
              >
                {length} digits
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-secondary-500">Valid for 24 hours.</p>
        </fieldset>
        <label className={cn(optionClass, "mt-3")}>
          <input
            type="checkbox"
            checked={pinNotify}
            disabled={pinBusy}
            onChange={(event) => setPinNotify(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
          />
          <span className="text-sm text-secondary-700">
            Email the PIN to the user
            <span className="mt-0.5 block text-xs text-secondary-500">
              {pinNotify
                ? "They get the PIN itself, straight away. Anyone with access to their inbox gets it too — so use a trusted channel instead where you have one."
                : "Nothing is sent. You relay the PIN yourself through a channel you trust."}
            </span>
          </span>
        </label>
        <label className={cn(optionClass, "mt-2")}>
          <input
            type="checkbox"
            checked={pinShare}
            disabled={pinBusy}
            onChange={(event) => setPinShare(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
          />
          <span className="text-sm text-secondary-700">
            Also create a one-time link
            <span className="mt-0.5 block text-xs text-secondary-500">
              {pinShare
                ? "Safer than pasting the PIN into a chat: the link reveals it once and then dies, so the PIN never sits in the conversation history."
                : "No link. The PIN stays unrecoverable — only its hash is stored."}
            </span>
          </span>
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={issued !== null}
        onOpenChange={(next) => !next && setIssued(null)}
        title="PIN issued"
        description="This will not be shown again. Give it to the user through a channel you trust."
        confirmLabel="Done"
        cancelLabel="Close"
        onConfirm={() => setIssued(null)}
      >
        {issued && (
          <div className="rounded-xl border-2 border-primary-200 bg-primary-50 p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-primary-800">
                {issued.pin}
              </span>
              <CopyButton value={issued.pin} label="Copy PIN" />
            </div>
            <p className="mt-2 text-xs text-secondary-600">
              For {issued.user.fullName} · expires{" "}
              {formatDateTime(issued.expiresAt)}
            </p>
          </div>
        )}
        {issued?.shareUrl && (
          <div className="mt-3 rounded-xl border border-secondary-200 bg-secondary-50 p-3">
            <p className="text-xs text-secondary-600">
              One-time link — send this instead of the PIN
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-secondary-800">
                {issued.shareUrl}
              </span>
              <CopyButton value={issued.shareUrl} label="Copy the PIN link" />
            </div>
            <p className="mt-1.5 text-xs text-secondary-500">
              Reveals the PIN once, then stops working.
            </p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={receipt !== null}
        onOpenChange={(next) => !next && setReceipt(null)}
        title="Receipt ready"
        description="Anyone with this link can view the receipt, so share it only with the client or their representative."
        confirmLabel="Done"
        cancelLabel="Close"
        onConfirm={() => setReceipt(null)}
      >
        {receipt && (
          <div className="space-y-3">
            <div className="rounded-xl border border-secondary-200 bg-secondary-50 p-3">
              <p className="text-xs text-secondary-500">Reference</p>
              <p className="font-mono text-sm font-semibold text-secondary-900">
                {receipt.reference}
              </p>
            </div>
            <div className="rounded-xl border-2 border-primary-200 bg-primary-50 p-3">
              <p className="text-xs text-secondary-600">Shareable link</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-primary-800">
                  {receipt.url}
                </span>
                <CopyButton value={receipt.url} label="Copy receipt link" />
              </div>
            </div>
            <a
              href={receipt.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-xs font-medium text-primary-700 underline underline-offset-2"
            >
              Open the receipt
            </a>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={holdingOpen}
        onOpenChange={(next) => !holdingBusy && setHoldingOpen(next)}
        title="Add a holding"
        confirmLabel="Add holding"
        busy={holdingBusy}
        onConfirm={() => void addHolding()}
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="holding-name"
              label="Name"
              placeholder="Bitcoin"
              value={holding.name}
              onChange={(event) =>
                setHolding((h) => ({ ...h, name: event.target.value }))
              }
              disabled={holdingBusy}
            />
            <Input
              id="holding-symbol"
              label="Symbol"
              placeholder="BTC"
              value={holding.symbol}
              onChange={(event) =>
                setHolding((h) => ({ ...h, symbol: event.target.value }))
              }
              disabled={holdingBusy}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="holding-units"
              label="Units"
              type="number"
              step="0.00000001"
              value={holding.units}
              onChange={(event) =>
                setHolding((h) => ({ ...h, units: event.target.value }))
              }
              disabled={holdingBusy}
            />
            <Input
              id="holding-value"
              label="Value (USD)"
              type="number"
              step="0.01"
              value={holding.valueUsd}
              onChange={(event) =>
                setHolding((h) => ({ ...h, valueUsd: event.target.value }))
              }
              disabled={holdingBusy}
            />
          </div>
          <label className={optionClass}>
            <input
              type="checkbox"
              checked={holding.creditLedger}
              disabled={holdingBusy}
              onChange={(event) =>
                setHolding((h) => ({ ...h, creditLedger: event.target.checked }))
              }
              className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
            />
            <span className="text-sm text-secondary-700">
              Also add this to the cash balance
              {/* Both states are spelled out because the difference is money:
                  off, the dashboard lists a position the balance knows nothing
                  about. */}
              <span className="mt-0.5 block text-xs text-secondary-500">
                {holding.creditLedger
                  ? `On — balance rises by ${holdingValueLabel}, and the position is listed on the dashboard.`
                  : "Off — the position is listed on the dashboard only. The balance does not move."}
              </span>
            </span>
          </label>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => !removeBusy && !next && setRemoving(null)}
        title="Remove this holding?"
        description={
          removing
            ? `${removing.name} (${formatUnits(removing.units)} ${removing.symbol.toUpperCase()}) will be archived.`
            : undefined
        }
        confirmLabel="Remove"
        tone="danger"
        busy={removeBusy}
        onConfirm={() => void removeHolding()}
      >
        <label className={optionClass}>
          <input
            type="checkbox"
            checked={reverseHolding}
            disabled={removeBusy}
            onChange={(event) => setReverseHolding(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
          />
          <span className="text-sm text-secondary-700">
            Also take back the money it added
            <span className="mt-0.5 block text-xs text-secondary-500">
              {reverseHolding
                ? "Writes a matching debit, so the balance and invested capital both come back down. Nothing happens if the position never credited the balance."
                : "The position goes, the money stays. Use this to write off a position you do not want to claw back."}
            </span>
          </span>
        </label>

        {/* Only when money is actually leaving — there is nothing to announce
            about a position that never credited the balance. */}
        {reverseHolding && (
          <label className={cn(optionClass, "mt-2")}>
            <input
              type="checkbox"
              checked={notifyHolding}
              disabled={removeBusy}
              onChange={(event) => setNotifyHolding(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-secondary-300 accent-primary-700"
            />
            <span className="text-sm text-secondary-700">
              Email the user about the money coming back out
              <span className="mt-0.5 block text-xs text-secondary-500">
                {notifyHolding
                  ? "They get a notice naming the position, the amount, and how to query it."
                  : "Nothing is sent. Off by default — most reversals are the desk correcting its own entry."}
              </span>
            </span>
          </label>
        )}
      </ConfirmDialog>
    </div>
  )
}

/**
 * Spells out what the two fields will actually do before the admin commits.
 *
 * The dialog previously showed a direction in the title and a category in a
 * dropdown and left the reader to work out how they combined — which is how
 * "Credit" + "Adjustment" got read as meaning adjustments were debits. Stating
 * both movements in one sentence removes the guess.
 */
function AdjustmentEffect({
  direction,
  category,
  amount,
}: {
  direction: Direction | null
  category: TxCategory
  amount: string
}) {
  const numeric = Number(amount)
  if (!direction || !Number.isFinite(numeric) || numeric <= 0) return null

  const option = CATEGORY_OPTIONS.find((item) => item.value === category)
  const verb = direction === "credit" ? "rises" : "falls"
  const figure = `$${numeric.toFixed(2)}`

  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-xs",
        direction === "credit"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      )}
    >
      <p className="font-semibold">After this:</p>
      <ul className="mt-1 space-y-0.5">
        <li>
          Total balance {verb} by {figure}
        </li>
        {option?.affects && (
          <li>
            {option.affects} {verb} by {figure}
          </li>
        )}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------- parts */

type Tx = AdminUserDetail["recentTransactions"][number]
type Sub = AdminUserDetail["subscriptions"][number]

const CATEGORY_ICON: Record<TxCategory, LucideIcon> = {
  DEPOSIT: ArrowDownToLine,
  WITHDRAWAL: ArrowUpFromLine,
  PROFIT: TrendingUp,
  PLAN_PAYOUT: TrendingUp,
  PLAN_PRINCIPAL: Coins,
  HOLDING: Layers,
  ADJUSTMENT: SlidersHorizontal,
}

/** Loopback only appears in local development; say so instead of `::1`. */
function displayIp(ip: string) {
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1" ? "Local" : ip
}

function formatPhone(value: string) {
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value
}

function BackLink() {
  return (
    <Link
      href="/admin/users"
      className={cn("inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-secondary-600 transition-colors hover:text-primary-700", focusRing)}
    >
      <ArrowLeft aria-hidden className="size-4" />
      All clients
    </Link>
  )
}

function HeroChip({ tone, children }: { tone: "good" | "bad" | "warn" | "plain"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
        tone === "good" && "bg-emerald-400/15 text-emerald-100 ring-emerald-300/30",
        tone === "bad" && "bg-red-400/20 text-red-100 ring-red-300/40",
        tone === "warn" && "bg-amber-400/20 text-amber-100 ring-amber-300/40",
        tone === "plain" && "bg-white/10 text-white ring-white/20"
      )}
    >
      {children}
    </span>
  )
}

function HeroFigure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white/5 p-3.5 sm:p-4">
      <dt className="text-xs text-primary-100" title={hint}>
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums sm:text-lg">{formatMoney(value)}</dd>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone = "plain",
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  tone?: "plain" | "primary" | "danger" | "good"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-13 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-semibold shadow-sm transition-colors",
        focusRing,
        tone === "primary" && "border-primary-700 bg-primary-700 text-white hover:bg-primary-800",
        tone === "plain" && "border-secondary-200 bg-white text-secondary-800 hover:border-primary-300 hover:text-primary-700",
        tone === "danger" && "border-red-200 bg-white text-red-600 hover:bg-red-50",
        tone === "good" && "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
      )}
    >
      <Icon aria-hidden className="size-4.5" />
      {label}
    </button>
  )
}

function PendingRow({
  href,
  icon: Icon,
  title,
  detail,
}: {
  href: string
  icon: LucideIcon
  title: string
  detail: string
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn("flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-amber-200 transition-colors hover:ring-amber-300", focusRing)}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold tabular-nums">{title}</span>
          <span className="block truncate text-xs text-secondary-500">{detail}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-amber-900">Review</span>
      </Link>
    </li>
  )
}

function Lifetime({ label, value, tone = "plain" }: { label: string; value: string; tone?: "plain" | "good" }) {
  return (
    <div className={cn(card, "min-w-0 rounded-2xl p-3 sm:rounded-[1.5rem] sm:p-5")}>
      <dt className="text-[11px] leading-tight text-secondary-600 sm:text-sm">{label}</dt>
      <dd
        className={cn(
          "mt-1 font-heading text-sm font-semibold tracking-tight tabular-nums sm:text-2xl",
          tone === "good" && !isZero(value) && "text-emerald-600"
        )}
      >
        {formatMoney(value)}
      </dd>
    </div>
  )
}

function EmptyPanel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-secondary-300 bg-secondary-50 px-6 py-10 text-center">
      <Icon aria-hidden className="size-6 text-secondary-400" />
      <p className="mt-3 max-w-xs text-sm text-secondary-600">{text}</p>
    </div>
  )
}

function TransactionRow({
  tx,
  busy,
  disabled,
  onReceipt,
}: {
  tx: Tx
  busy: boolean
  disabled: boolean
  onReceipt: () => void
}) {
  const credit = tx.type === "CREDIT"
  const voided = tx.status === "REJECTED" || tx.status === "CANCELLED"
  const Icon = CATEGORY_ICON[tx.category]

  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full ring-1",
          credit ? "bg-emerald-50 text-emerald-600 ring-emerald-100" : "bg-secondary-100 text-secondary-600 ring-secondary-200"
        )}
      >
        <Icon aria-hidden className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{tx.description ?? humanise(tx.category)}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-secondary-500">
          <span>{formatDateTime(tx.createdAt)}</span>
          <span className="hidden text-secondary-300 sm:inline">·</span>
          <span className="hidden sm:inline">{humanise(tx.category)}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            voided ? "text-secondary-400 line-through" : credit ? "text-emerald-600" : "text-secondary-900"
          )}
        >
          {credit ? "+" : "-"}
          {formatMoney(tx.amount)}
        </span>
        {tx.status !== "COMPLETED" && <StatusBadge status={tx.status} className="px-2 py-0.5 text-[11px]" />}
      </div>
      {/* Only completed movements. A receipt for something still pending
          would be a promise rather than a record. */}
      {tx.status === "COMPLETED" ? (
        <button
          type="button"
          onClick={onReceipt}
          disabled={disabled}
          aria-label="Create a shareable receipt"
          title="Create a shareable receipt"
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg border border-secondary-200 text-secondary-500 transition-colors hover:border-primary-300 hover:text-primary-700 disabled:opacity-50",
            focusRing
          )}
        >
          {busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ReceiptText aria-hidden className="size-4" />}
        </button>
      ) : (
        <span aria-hidden className="size-9 shrink-0" />
      )}
    </li>
  )
}

function PlanRow({ sub, now }: { sub: Sub; now: number }) {
  const active = sub.status === "ACTIVE"
  const progress = sub.totalPeriods > 0 ? Math.min(100, (sub.paidPeriods / sub.totalPeriods) * 100) : 0
  const next = sub.nextPayoutAt ? countdown(sub.nextPayoutAt, now) : null

  return (
    <li className="rounded-2xl border border-secondary-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{sub.planName}</p>
          <p className="text-xs text-secondary-500">
            Started {formatDate(sub.startedAt)} · {active ? "ends" : "ended"} {formatDate(sub.endsAt)}
          </p>
        </div>
        <StatusBadge status={sub.status} className="px-2 py-0.5 text-[11px]" />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-secondary-500">Principal</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(sub.principal)}</dd>
        </div>
        <div>
          <dt className="text-xs text-secondary-500">Per day</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(sub.dailyPayout)}</dd>
        </div>
        <div>
          <dt className="text-xs text-secondary-500">Paid so far</dt>
          <dd className="font-semibold text-emerald-600 tabular-nums">{formatMoney(sub.totalAccrued)}</dd>
        </div>
      </dl>
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary-100">
          <div
            className={cn("h-full rounded-full", active ? "bg-primary-600" : "bg-secondary-400")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-1.5 flex justify-between gap-2 text-[11px] text-secondary-500 tabular-nums">
          <span>
            Day {sub.paidPeriods} of {sub.totalPeriods}
          </span>
          {active && next && <span>Next payout in {next}</span>}
          {active && !next && sub.nextPayoutAt && <span>Payout due now</span>}
        </p>
      </div>
    </li>
  )
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  external = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  href: string
  external?: boolean
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-secondary-50 p-2.5 ring-1 ring-secondary-200">
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg", focusRing)}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-primary-700 ring-1 ring-secondary-200">
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] text-secondary-500">{label}</span>
          <span className="block truncate text-sm font-semibold">{value}</span>
        </span>
      </a>
      <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} className="shrink-0" />
    </li>
  )
}

function Fact({ label, value, sub, mono = false }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-secondary-500">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className={cn("block truncate font-semibold", mono && "font-mono text-[13px]")}>{value}</span>
        {sub && <span className="block text-xs text-secondary-500">{sub}</span>}
      </dd>
    </div>
  )
}

/** A checkbox with a heading and a line that says what each state does. */
const optionClass =
  "flex cursor-pointer items-start gap-3 rounded-xl bg-secondary-50 p-3.5 ring-1 ring-secondary-200 has-[:checked]:bg-primary-50/60 has-[:checked]:ring-primary-200"
