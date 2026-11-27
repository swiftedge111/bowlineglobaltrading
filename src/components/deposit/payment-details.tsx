import { AlertTriangle } from "lucide-react"

import { CopyButton } from "@/components/ui/copy-button"
import type {
  BankAccountDetails,
  CryptoWalletDetails,
  DigitalWalletDetails,
} from "@/lib/api/types"
import { cn } from "@/lib/utils"

export function BankPaymentDetails({ bank }: { bank: BankAccountDetails }) {
  return (
    <dl className="divide-y divide-secondary-100 overflow-hidden rounded-2xl border border-secondary-200">
      <DetailRow label="Bank" value={bank.bankName} />
      <DetailRow label="Account name" value={bank.accountName} copyable />
      <DetailRow
        label="Account number"
        value={bank.accountNumber}
        copyable
        mono
      />
      {bank.routingNumber && (
        <DetailRow
          label="Routing number"
          value={bank.routingNumber}
          copyable
          mono
        />
      )}
      {bank.swiftCode && (
        <DetailRow label="SWIFT / BIC" value={bank.swiftCode} copyable mono />
      )}
    </dl>
  )
}

export function CryptoPaymentDetails({
  wallet,
}: {
  wallet: CryptoWalletDetails
}) {
  return (
    <>
      <div className="rounded-2xl border border-secondary-200 bg-secondary-50/60 p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold wrap-anywhere">
            {wallet.label}
          </p>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-secondary-700 wrap-anywhere ring-1 ring-secondary-200">
            {wallet.network}
          </span>
        </div>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-secondary-500 uppercase">
          Deposit address
        </p>
        <div className="mt-1 flex items-start gap-2 rounded-xl bg-white p-3 ring-1 ring-secondary-200">
          <code className="min-w-0 flex-1 font-mono text-sm leading-relaxed break-all">
            {wallet.walletAddress}
          </code>
          <CopyButton
            value={wallet.walletAddress}
            label={`Copy ${wallet.currency} address`}
            variant="inline"
          />
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
        <AlertTriangle
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-amber-600"
        />
        <span className="min-w-0 wrap-anywhere">
          Send only <strong>{wallet.currency}</strong> on the{" "}
          <strong>{wallet.network}</strong> network. Funds sent on any other
          network cannot be recovered.
        </span>
      </p>
    </>
  )
}

export function DigitalWalletPaymentDetails({
  wallet,
}: {
  wallet: DigitalWalletDetails
}) {
  return (
    <div className="rounded-2xl border border-secondary-200 bg-secondary-50/60 p-4">
      <p className="text-sm font-semibold wrap-anywhere">{wallet.provider}</p>
      <div className="mt-2 flex items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-secondary-200">
        <code className="min-w-0 flex-1 font-mono text-sm break-all">
          {wallet.handle}
        </code>
        <CopyButton
          value={wallet.handle}
          label={`Copy ${wallet.provider} handle`}
          variant="inline"
        />
      </div>
      {wallet.instructions && (
        <p className="mt-2 text-xs leading-relaxed text-secondary-600 wrap-anywhere">
          {wallet.instructions}
        </p>
      )}
    </div>
  )
}

function DetailRow({
  label,
  value,
  copyable = false,
  mono = false,
}: {
  label: string
  value: string
  copyable?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-white px-4 py-3">
      <dt className="shrink-0 text-sm text-secondary-500">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "min-w-0 text-sm font-semibold wrap-anywhere",
            mono && "font-mono"
          )}
        >
          {value}
        </span>
        {copyable && (
          <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
        )}
      </dd>
    </div>
  )
}
