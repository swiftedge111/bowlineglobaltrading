"use client"

import { useState } from "react"
import { Dialog } from "radix-ui"
import {
  Bitcoin,
  Eye,
  EyeOff,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  X,
} from "lucide-react"

import theme from "@/app/bowline-theme.module.css"
import { Badge, card, focusRing, Tile } from "@/components/admin/queue-parts"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { ErrorState } from "@/components/app/empty-state"
import {
  BankPaymentDetails,
  CryptoPaymentDetails,
  DigitalWalletPaymentDetails,
} from "@/components/deposit/payment-details"
import { CopyButton } from "@/components/ui/copy-button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { isApiError } from "@/lib/api/client"
import * as api from "@/lib/api/endpoints"
import type {
  BankConfig,
  CryptoConfig,
  PaymentMethodConfig,
  WalletConfig,
} from "@/lib/api/types"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

type Editor =
  | { kind: "bank"; item: BankConfig | null }
  | { kind: "crypto"; item: CryptoConfig | null }
  | { kind: "wallet"; item: WalletConfig | null }

type Method =
  | { kind: "bank"; item: BankConfig }
  | { kind: "crypto"; item: CryptoConfig }
  | { kind: "wallet"; item: WalletConfig }

type Removable = Exclude<Method, { kind: "bank" }>

const methodTypes = {
  bank: { label: "Bank transfer", icon: Landmark },
  crypto: { label: "Crypto wallet", icon: Bitcoin },
  wallet: { label: "Digital wallet", icon: Smartphone },
}

const headerAction =
  "inline-flex h-11 items-center gap-2 rounded-xl border border-secondary-200 bg-white px-3 text-sm font-semibold text-secondary-800 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-700 disabled:opacity-50 sm:px-4"

const primaryAction =
  "inline-flex h-11 items-center gap-2 rounded-xl bg-primary-700 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 disabled:opacity-50 sm:px-4"

const cardAction =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-secondary-700 transition-colors hover:bg-secondary-100 hover:text-primary-700 disabled:opacity-50"

function methodDetails(method: Method) {
  switch (method.kind) {
    case "bank":
      return {
        name: method.item.bankName,
        subtitle: method.item.accountName,
        value: method.item.accountNumber,
        valueLabel: "Account number",
      }
    case "crypto":
      return {
        name: method.item.label,
        subtitle: `${method.item.currency} · ${method.item.network}`,
        value: method.item.walletAddress,
        valueLabel: "Wallet address",
      }
    case "wallet":
      return {
        name: method.item.provider,
        subtitle: method.item.instructions,
        value: method.item.handle,
        valueLabel: "Handle",
      }
  }
}

export function AdminPaymentMethodsScreen() {
  const toast = useToast()
  const config = useAsyncData(
    () => api.admin.paymentMethods(),
    "admin-payment-methods"
  )
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleting, setDeleting] = useState<Removable | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const data = config.data
  const methods: Method[] = []
  if (data?.bank) methods.push({ kind: "bank", item: data.bank })
  for (const item of data?.crypto ?? []) methods.push({ kind: "crypto", item })
  for (const item of data?.digitalWallets ?? [])
    methods.push({ kind: "wallet", item })

  const live = methods.filter(({ item }) => item.isActive).length
  const hidden = methods.length - live

  async function remove() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      if (deleting.kind === "crypto") {
        await api.admin.deleteCryptoWallet(deleting.item.id)
      } else {
        await api.admin.deleteDigitalWallet(deleting.item.id)
      }
      toast.success("Payment method removed")
      setDeleting(null)
      config.reload()
    } catch (cause) {
      toast.fromError(cause, "Could not remove the payment method.")
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Payment{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              methods.
            </span>
          </h2>
          <p className="mt-2 text-sm text-secondary-600 sm:text-base">
            Manage where clients send their deposits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditor({ kind: "crypto", item: null })}
            disabled={!data || config.loading}
            className={cn(primaryAction, focusRing)}
          >
            <Plus aria-hidden className="size-4" /> New crypto wallet
          </button>
          <button
            type="button"
            onClick={() => setEditor({ kind: "wallet", item: null })}
            disabled={!data || config.loading}
            className={cn(headerAction, focusRing)}
          >
            <Plus aria-hidden className="size-4" /> New digital wallet
          </button>
        </div>
      </div>

      {Boolean(config.error) && (
        <ErrorState
          title="Could not load payment methods"
          onRetry={config.reload}
        />
      )}

      {(data || config.loading) && (
        <dl className="grid grid-cols-2 gap-3 sm:gap-4">
          <Tile
            icon={Eye}
            label="Live"
            value={data ? `${live} of ${methods.length}` : undefined}
            sub="On the deposit page"
            tone="good"
            loading={!data}
          />
          <Tile
            icon={EyeOff}
            label="Hidden"
            value={data ? String(hidden) : undefined}
            loading={!data}
          />
        </dl>
      )}

      {data ? (
        <ul className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {!data.bank && (
            <li className={cn(card, "min-w-0 p-5 sm:p-6")}>
              <div className="flex items-start gap-3">
                <MethodIcon kind="bank" />
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">Bank transfer</h3>
                  <p className="mt-0.5 text-sm text-secondary-500">
                    No bank account set up.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={config.loading}
                className={cn(cardAction, focusRing, "mt-3")}
                onClick={() => setEditor({ kind: "bank", item: null })}
              >
                <Plus aria-hidden className="size-4" /> Set up bank account
              </button>
            </li>
          )}
          {methods.map((method) => (
            <MethodCard
              key={method.item.id}
              method={method}
              disabled={config.loading}
              onEdit={() => setEditor(method)}
              onDelete={
                method.kind === "bank" ? undefined : () => setDeleting(method)
              }
            />
          ))}
        </ul>
      ) : config.loading ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 w-full rounded-[1.5rem]" />
          <Skeleton className="h-48 w-full rounded-[1.5rem]" />
        </div>
      ) : null}

      {editor && data && (
        <MethodEditor
          key={editor.item?.id ?? editor.kind}
          editor={editor}
          config={data}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null)
            config.reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && !deleteBusy && setDeleting(null)}
        title="Remove this payment method?"
        description={
          deleting && (
            <span className="wrap-anywhere">
              {deleting.item.isActive
                ? "The deposit page will no longer show "
                : "This removes the saved details for "}
              <strong>{methodName(deleting.item)}</strong>.
            </span>
          )
        }
        confirmLabel="Remove"
        tone="danger"
        busy={deleteBusy}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function MethodIcon({ kind }: { kind: Method["kind"] }) {
  const Icon = methodTypes[kind].icon
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
      <Icon aria-hidden className="size-5" />
    </span>
  )
}

function MethodCard({
  method,
  disabled,
  onEdit,
  onDelete,
}: {
  method: Method
  disabled: boolean
  onEdit: () => void
  onDelete?: () => void
}) {
  const { name, subtitle, value, valueLabel } = methodDetails(method)
  const live = method.item.isActive

  return (
    <li className={cn(card, "flex min-w-0 flex-col overflow-hidden")}>
      <div className="flex-1 p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <MethodIcon kind={method.kind} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-secondary-500">
              {methodTypes[method.kind].label}
            </p>
            <h3 className="text-lg leading-tight font-semibold wrap-anywhere">
              {name}
            </h3>
            {subtitle && (
              <p className="mt-1 text-sm text-secondary-500 wrap-anywhere">
                {subtitle}
              </p>
            )}
          </div>
          <Badge tone={live ? "info" : "warn"}>
            {live ? (
              <Eye aria-hidden className="size-3" />
            ) : (
              <EyeOff aria-hidden className="size-3" />
            )}
            {live ? "Live" : "Hidden"}
          </Badge>
        </div>
      </div>
      <dl className="grid min-w-0 grid-cols-1 border-y border-secondary-200 bg-secondary-50/70 px-5 py-3 sm:px-6">
        <div className="min-w-0">
          <dt className="text-[11px] text-secondary-500">{valueLabel}</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 font-mono text-sm wrap-anywhere">
              {value}
            </code>
            <CopyButton
              value={value}
              label={`Copy ${valueLabel.toLowerCase()}`}
            />
          </dd>
        </div>
      </dl>
      <div className="flex items-center gap-1 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          className={cn(cardAction, focusRing)}
        >
          <Pencil aria-hidden className="size-4" /> Edit
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            aria-label={`Remove ${name}`}
            title="Remove"
            className={cn(
              "ml-auto grid size-9 place-items-center rounded-lg text-secondary-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50",
              focusRing
            )}
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </div>
    </li>
  )
}

const fields = {
  bank: [
    { key: "bankName", label: "Bank name", min: 2, max: 120 },
    { key: "accountName", label: "Account name", min: 2, max: 120 },
    {
      key: "accountNumber",
      label: "Account number",
      min: 4,
      max: 40,
      mono: true,
    },
    {
      key: "routingNumber",
      label: "Routing number",
      min: 0,
      max: 40,
      mono: true,
    },
    { key: "swiftCode", label: "SWIFT / BIC", min: 0, max: 20, mono: true },
  ],
  crypto: [
    { key: "currency", label: "Currency", min: 2, max: 20, fixed: true },
    { key: "label", label: "Label", min: 2, max: 60 },
    { key: "network", label: "Network", min: 2, max: 40 },
    {
      key: "walletAddress",
      label: "Wallet address",
      min: 10,
      max: 120,
      mono: true,
    },
  ],
  wallet: [
    { key: "provider", label: "Provider", min: 2, max: 40, fixed: true },
    { key: "handle", label: "Handle", min: 2, max: 120, mono: true },
    { key: "instructions", label: "Instructions", min: 0, max: 300 },
  ],
} as const

type Field = (typeof fields)[Editor["kind"]][number]
type FieldKey = Field["key"]

const blank: Record<FieldKey, string> = {
  bankName: "",
  accountName: "",
  accountNumber: "",
  routingNumber: "",
  swiftCode: "",
  currency: "",
  label: "",
  network: "",
  walletAddress: "",
  provider: "",
  handle: "",
  instructions: "",
}

function methodName(item: Method["item"]) {
  if ("bankName" in item) return item.bankName
  if ("label" in item) return item.label
  return item.provider
}

function MethodEditor({
  editor,
  config,
  onClose,
  onSaved,
}: {
  editor: Editor
  config: PaymentMethodConfig
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [values, setValues] = useState(() => ({ ...blank, ...editor.item }))
  const [isActive, setIsActive] = useState(editor.item?.isActive ?? true)
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [confirmHide, setConfirmHide] = useState(false)

  const { kind, item } = editor
  const methodLabel = methodTypes[kind].label.toLowerCase()
  const currentName = item ? methodName(item) : null
  const inputs: readonly Field[] = fields[kind]
  const errors: Partial<Record<FieldKey, string>> = {}
  for (const { key, min, max } of inputs) {
    const length = values[key]?.trim().length ?? 0
    if (length < min)
      errors[key] = length
        ? `Use at least ${min} characters.`
        : "This field is required."
    else if (length > max) errors[key] = `Use ${max} characters or fewer.`
  }

  const currency = values.currency.trim().toUpperCase()
  const provider = values.provider.trim()
  if (
    !item &&
    kind === "crypto" &&
    config.crypto.some((wallet) => wallet.currency === currency)
  ) {
    errors.currency =
      "A wallet already uses this currency. Edit that wallet to change its details."
  }
  if (
    !item &&
    kind === "wallet" &&
    config.digitalWallets.some((wallet) => wallet.provider === provider)
  ) {
    errors.provider =
      "This provider is already set up. Edit that wallet to change its details."
  }

  const bank = {
    bankName: values.bankName.trim(),
    accountName: values.accountName.trim(),
    accountNumber: values.accountNumber.trim(),
    routingNumber: values.routingNumber?.trim() ?? "",
    swiftCode: values.swiftCode?.trim() ?? "",
    isActive,
  }
  const crypto = {
    currency,
    label: values.label.trim(),
    network: values.network.trim(),
    walletAddress: values.walletAddress.trim(),
    isActive,
  }
  const wallet = {
    provider,
    handle: values.handle.trim(),
    instructions: values.instructions?.trim() ?? "",
    isActive,
  }
  const valid = Object.keys(errors).length === 0

  async function save() {
    setBusy(true)
    try {
      if (kind === "bank") await api.admin.saveBank(bank)
      else if (kind === "crypto") await api.admin.saveCryptoWallet(crypto)
      else await api.admin.saveDigitalWallet(wallet)
      toast.success(
        item?.isActive && !isActive
          ? "Payment method hidden"
          : "Payment method saved"
      )
      onSaved()
    } catch (cause) {
      if (isApiError(cause)) setServerErrors(cause.fieldErrors())
      setConfirmHide(false)
      toast.fromError(cause, "Could not save the payment method.")
    } finally {
      setBusy(false)
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    setServerErrors({})
    if (!valid) {
      toast.error("Check the highlighted fields.")
      return
    }
    if (item?.isActive && !isActive) setConfirmHide(true)
    else void save()
  }

  return (
    <Dialog.Root open onOpenChange={(next) => !next && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#092739]/45 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            theme.bowline,
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-secondary-50 text-secondary-900 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-secondary-200 bg-white px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold">
                {currentName ? `Edit ${currentName}` : `New ${methodLabel}`}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-secondary-500">
                Changes apply to the client deposit page.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              disabled={busy}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg text-secondary-500 hover:bg-secondary-100",
                focusRing
              )}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <form
            onSubmit={submit}
            noValidate
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <div className="min-w-0 flex-1 space-y-4 overflow-y-auto p-5">
              <section className={cn(card, "min-w-0 space-y-3 p-4")}>
                <h3 className="text-sm font-semibold">Payment details</h3>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  {inputs.map((field) => {
                    const fixed = "fixed" in field && item !== null
                    const full = [
                      "accountNumber",
                      "walletAddress",
                      "instructions",
                    ].includes(field.key)
                    return (
                      <div
                        key={field.key}
                        className={cn("min-w-0", full && "sm:col-span-2")}
                      >
                        <Input
                          id={`payment-${field.key}`}
                          label={field.label}
                          value={values[field.key] ?? ""}
                          optional={field.min === 0}
                          disabled={busy || fixed}
                          hint={
                            fixed
                              ? "Fixed once the wallet is created."
                              : undefined
                          }
                          error={
                            submitted
                              ? (errors[field.key] ?? serverErrors[field.key])
                              : undefined
                          }
                          className={cn(
                            "min-w-0",
                            "mono" in field && "font-mono"
                          )}
                          onChange={(event) => {
                            const value = event.target.value
                            setValues((previous) => ({
                              ...previous,
                              [field.key]: value,
                            }))
                            if (serverErrors[field.key])
                              setServerErrors((previous) => ({
                                ...previous,
                                [field.key]: "",
                              }))
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
                <label className="flex items-start justify-between gap-3 rounded-xl border border-secondary-200 bg-secondary-50/70 p-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      Live on the deposit page
                    </span>
                    <span className="block text-xs text-secondary-500">
                      Turn off to hide this method from clients.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={isActive}
                    disabled={busy}
                    onChange={(event) => setIsActive(event.target.checked)}
                    className={cn(
                      "relative h-6 w-11 shrink-0 appearance-none rounded-full bg-secondary-300 transition-colors before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-white before:shadow-sm before:transition-transform checked:bg-primary-700 checked:before:translate-x-5 disabled:opacity-50",
                      focusRing
                    )}
                  />
                </label>
              </section>

              <section className={cn(card, "min-w-0 space-y-3 p-4")}>
                <h3 className="text-sm font-semibold">Deposit page preview</h3>
                {!isActive ? (
                  <p className="text-sm text-secondary-600">
                    This method will be hidden from clients.
                  </p>
                ) : !valid ? (
                  <p className="text-sm text-secondary-600">
                    Enter the payment details to see the preview.
                  </p>
                ) : (
                  <div className="grid min-w-0 grid-cols-1 gap-3">
                    {kind === "bank" && <BankPaymentDetails bank={bank} />}
                    {kind === "crypto" && (
                      <CryptoPaymentDetails wallet={crypto} />
                    )}
                    {kind === "wallet" && (
                      <DigitalWalletPaymentDetails wallet={wallet} />
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="flex gap-2 border-t border-secondary-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <Dialog.Close
                disabled={busy}
                className={cn(
                  "h-12 rounded-xl px-4 text-sm font-semibold text-secondary-700 hover:bg-secondary-100",
                  focusRing
                )}
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={busy}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-700 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-800 disabled:opacity-50",
                  focusRing
                )}
              >
                {busy && (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                )}
                {item ? "Save changes" : "Save payment method"}
              </button>
            </div>
          </form>

          <ConfirmDialog
            open={confirmHide}
            onOpenChange={(next) => !next && !busy && setConfirmHide(false)}
            title="Hide this payment method?"
            description={
              <span className="wrap-anywhere">
                The deposit page will no longer show{" "}
                <strong>{currentName ?? methodLabel}</strong>. You can make it
                live again at any time.
              </span>
            }
            confirmLabel="Hide and save"
            busy={busy}
            onConfirm={() => void save()}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
