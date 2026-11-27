/**
 * Response shapes for the Bowline API.
 *
 * These mirror the serialisers in `server/src/`, which are the authority. Two
 * conventions carry over and matter everywhere:
 *
 *  - **Money is a decimal string**, e.g. `"1234.56"` — never a number. Format it
 *    with the helpers in `@/lib/format`; never put it through `parseFloat` for
 *    arithmetic.
 *  - **Dates are ISO strings**, because they crossed JSON to get here.
 */

/* ------------------------------------------------------------------ errors */

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "TOKEN_EXPIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INSUFFICIENT_FUNDS"
  | "INVALID_PIN"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  /** Client-side only: the request never reached the server. */
  | "NETWORK_ERROR"

export interface ApiErrorDetail {
  /** Dotted path from the server, e.g. `"body.email"`. */
  path: string
  message: string
}

/* -------------------------------------------------------------- envelopes */

export interface PageMeta {
  page: number
  limit: number
  total: number
  pages: number
}

export interface Paginated<T> {
  items: T[]
  meta: PageMeta
}

/* ------------------------------------------------------------------- auth */

export type Role = "USER" | "ADMIN"
export type UserStatus = "ACTIVE" | "SUSPENDED"

export interface PublicUser {
  id: string
  uid: string
  email: string
  username: string
  fullName: string
  phone: string | null
  /** ISO 3166-1 alpha-2. Null for accounts predating the field. */
  country: string | null
  /** E.164 WhatsApp / Telegram number. Null for accounts predating the field. */
  contactPhone: string | null
  emailVerified: boolean
  role: Role
  status: UserStatus
  createdAt: string
  lastLoginAt: string | null
}

/** A signed-in device, as listed in Settings. */
export interface DeviceSession {
  id: string
  userAgent: string | null
  ip: string | null
  /** When this device last refreshed its sign-in. */
  lastActiveAt: string
  expiresAt: string
  /** False when "keep me signed in" was not ticked. */
  persistent: boolean
  /** The session making this request. */
  current: boolean
}

export interface SessionPayload {
  user: PublicUser
  accessToken: string
}

export interface RegisterInput {
  fullName: string
  email: string
  username: string
  /** ISO 3166-1 alpha-2 country of residence. */
  country: string
  /** E.164. Required since phone became mandatory at signup. */
  phone: string
  /** E.164 WhatsApp / Telegram contact number. Required for new accounts. */
  contactPhone: string
  password: string
  acceptedTerms: true
}

export interface LoginInput {
  identifier: string
  password: string
  /** `false` issues a session cookie that dies when the browser closes. */
  remember?: boolean
}

/* -------------------------------------------------------------- portfolio */

export interface HoldingSummary {
  id: string
  name: string
  symbol: string
  /** Fractional units, up to 8 decimal places. */
  units: string
  valueUsd: string
  createdAt?: string
}

export interface PortfolioSummary {
  balance: string
  available: string
  reserved: string
  /** Principal locked in active plans. Not part of `balance`. */
  inPlans: string
  /** `balance` plus `inPlans`. */
  accountValue: string
  /** Lifetime deposits and holding credits. */
  investedCapital: string
  profitEarned: string
  todayProfit: string
  yesterdayProfit: string
  weekProfit: string
  totalReturnPercent: string
  holdingsValue: string
  holdings: HoldingSummary[]
}

export type PerformancePeriod = "7d" | "1m" | "3m" | "1y" | "all"

export interface PerformancePoint {
  /** `YYYY-MM-DD`, bucketed in UTC. */
  date: string
  value: string
  change: string
}

export interface PerformanceSeries {
  period: PerformancePeriod
  points: PerformancePoint[]
}

/* ----------------------------------------------------------- transactions */

export type TxType = "CREDIT" | "DEBIT"
export type TxStatus = "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED"
export type TxCategory =
  | "DEPOSIT"
  | "PROFIT"
  | "HOLDING"
  | "WITHDRAWAL"
  | "ADJUSTMENT"
  | "PLAN_PAYOUT"
  | "PLAN_PRINCIPAL"

export interface Transaction {
  id: string
  type: TxType
  category: TxCategory
  amount: string
  status: TxStatus
  description: string | null
  metadata: unknown
  createdAt: string
}

export interface TransactionSummary {
  count: number
  /** Settled credits. */
  moneyIn: string
  /** Settled debits. */
  moneyOut: string
  pending: { count: number; amount: string }
}

/* --------------------------------------------------------------- deposits */

export type DepositMethod =
  | "BANK_TRANSFER"
  | "CRYPTO"
  | "DIGITAL_WALLET"
  | "CARD"

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"

export interface BankAccountDetails {
  bankName: string
  accountName: string
  accountNumber: string
  routingNumber: string | null
  swiftCode: string | null
}

export interface CryptoWalletDetails {
  currency: string
  label: string
  walletAddress: string
  network: string
}

export interface DigitalWalletDetails {
  provider: string
  handle: string
  instructions: string | null
}

export interface DepositMethods {
  bank: BankAccountDetails | null
  crypto: CryptoWalletDetails[]
  digitalWallets: DigitalWalletDetails[]
  minimumDeposit: string
  supportEmail: string
}

export interface DepositRequest {
  id: string
  amount: string
  method: DepositMethod
  reference: string | null
  status: RequestStatus
  reviewNote: string | null
  hasProof: boolean
  createdAt: string
}

/* ------------------------------------------------------------ withdrawals */

export type WithdrawalMethod = "CRYPTO" | "BANK"

export interface CryptoDestination {
  walletAddress: string
  network: string
  currency: string | null
}

export interface BankDestination {
  bankName: string
  accountName: string
  accountNumber: string
  routingNumber: string | null
  swiftCode: string | null
}

export type WithdrawalDestination = CryptoDestination | BankDestination

export interface WithdrawalRequest {
  id: string
  amount: string
  fee: string
  method: WithdrawalMethod
  status: RequestStatus
  destination: WithdrawalDestination
  reviewNote: string | null
  createdAt: string
}

/**
 * The fee and floor the server enforces, sent with the withdrawal list so the
 * client's preview is always the server's own arithmetic rather than a second
 * copy of the rule that can fall out of step.
 */
export interface WithdrawalLimits {
  /** Percent as a decimal string, e.g. `"5.00"`. */
  feePercent: string
  /** Minimum withdrawal in USD, e.g. `"10.00"`. */
  minimum: string
}

export interface CreateWithdrawalInput {
  amount: number
  method: WithdrawalMethod
  pin: string
  walletAddress?: string
  network?: string
  currency?: string
  bankName?: string
  accountName?: string
  accountNumber?: string
  routingNumber?: string
  swiftCode?: string
}

/* ------------------------------------------------------------------ plans */

export interface Plan {
  id: string
  slug: string
  name: string
  /** Percent per day, e.g. `"1.20"`. */
  dailyReturnPercent: string
  durationDays: number
  minDeposit: string
  maxDeposit: string | null
  referralBonusPercent: number
  description: string | null
  features: string[]
  isPopular: boolean
}

export type SubscriptionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED"

export interface Subscription {
  id: string
  plan: Plan
  principal: string
  totalAccrued: string
  status: SubscriptionStatus
  startedAt: string
  endsAt: string
  /** What each daily period pays, e.g. `"12.00"`. */
  dailyPayout: string
  paidPeriods: number
  totalPeriods: number
  /** ISO time the next return is earned; null once the plan stops paying. */
  nextPayoutAt: string | null
}

/* ------------------------------------------------------------------ admin */

export interface AdminStats {
  users: { total: number; active: number; newToday: number; newThisWeek: number }
  queues: {
    pendingDeposits: number
    pendingDepositsAmount: string
    pendingWithdrawals: number
    pendingWithdrawalsAmount: string
  }
  ledger: {
    totalCredited: string
    totalDebited: string
    /** Cash balances plus principal in active plans: what clients are owed. */
    clientLiability: string
    clientCash: string
    inPlans: string
    /** Held against pending withdrawals; part of clientCash. */
    reserved: string
  }
  plans: { active: number; maturingThisWeek: number; maturingPrincipal: string }
  /** Real money in and out over `days`, excluding internal plan transfers. */
  flows: {
    days: number
    deposits: string
    depositCount: number
    /** Includes withdrawal fees. */
    withdrawals: string
    withdrawalCount: number
    returnsPaid: string
    series: Array<{ date: string; deposits: string; withdrawals: string }>
  }
}

export interface AdminUserListItem {
  id: string
  uid: string
  email: string
  username: string
  fullName: string
  phone: string | null
  /** ISO 3166-1 alpha-2. Null for accounts predating the field. */
  country: string | null
  role: Role
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
  emailVerified: boolean
  balance: string
  available: string
  /** Principal in active plans; owed to the client on top of `balance`. */
  inPlans: string
}

export type AdminUserSort = "newest" | "oldest" | "lastSeen" | "name"

/** Tab counts for the Users screen. All but `admins` count clients only. */
export interface AdminUserCounts {
  clients: number
  active: number
  suspended: number
  unverified: number
  newThisWeek: number
  admins: number
}

export interface AdminUserDetail {
  user: {
    id: string
    uid: string
    email: string
    username: string
    fullName: string
    phone: string | null
    contactPhone: string | null
    /** ISO 3166-1 alpha-2 country of residence. */
    country: string | null
    /** Server-derived registration network address. */
    signupIp: string | null
    /** Best-effort ISO-2 country inferred from the registration IP. */
    signupCountry: string | null
    emailVerified: boolean
    role: Role
    status: UserStatus
    lastLoginAt: string | null
    lastLoginIp: string | null
    createdAt: string
  }
  balance: {
    balance: string
    available: string
    reserved: string
    /** Principal in active plans. */
    inPlans: string
    /** `balance + inPlans`: everything the platform owes this client. */
    accountValue: string
  }
  /** Completed movements over the account's life, net of reversals. */
  lifetime: { deposited: string; withdrawn: string; earned: string }
  /** Requests waiting for review, oldest first. */
  pending: {
    deposits: Array<{ id: string; amount: string; method: DepositMethod; createdAt: string }>
    withdrawals: Array<{ id: string; amount: string; fee: string; method: WithdrawalMethod; createdAt: string }>
  }
  holdings: HoldingSummary[]
  subscriptions: Array<{
    id: string
    planName: string
    principal: string
    totalAccrued: string
    status: SubscriptionStatus
    startedAt: string
    endsAt: string
    dailyPayout: string
    paidPeriods: number
    totalPeriods: number
    nextPayoutAt: string | null
  }>
  recentTransactions: Array<{
    id: string
    type: TxType
    category: TxCategory
    amount: string
    status: TxStatus
    description: string | null
    createdAt: string
  }>
}

/** The user summary embedded in admin queue rows. */
export interface QueueUser {
  uid: string
  email: string
  fullName: string
}

export interface AdminDepositRow {
  id: string
  user: QueueUser
  amount: string
  method: DepositMethod
  reference: string | null
  status: RequestStatus
  hasProof: boolean
  /** From the stored file name, so the review can preview an image inline. */
  proofKind: "image" | "pdf" | "file" | null
  /** Deposits this client has had approved, this one included if it was. */
  userApprovedDeposits: number
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNote: string | null
  createdAt: string
}

export interface AdminDepositSummary {
  pending: { count: number; amount: string; oldestAt: string | null }
  approvedToday: { count: number; amount: string }
  approved30d: { count: number; amount: string }
  rejected30d: number
}

export interface AdminWithdrawalRow {
  id: string
  user: QueueUser
  amount: string
  fee: string
  method: WithdrawalMethod
  destination: WithdrawalDestination
  status: RequestStatus
  createdAt: string
}

export type PinStatus = "ACTIVE" | "USED" | "EXPIRED" | "REVOKED"

export interface AdminPin {
  id: string
  user: { uid: string; fullName: string; email: string } | null
  status: PinStatus
  expiresAt: string
  usedAt: string | null
  createdAt: string
}

/** Returned exactly once, to the issuing admin. */
export interface IssuedPin {
  pin: string
  expiresAt: string
  user: { uid: string; fullName: string }
  /** Present only when a one-time link was requested at issue time. */
  shareUrl?: string
}

/**
 * What a PIN link discloses before it is spent. Deliberately no PIN: this is
 * the shape a chat app's link-preview crawler receives, and revealing on a
 * plain fetch would burn the link before the recipient ever opened it.
 */
export interface PinShare {
  state: "READY" | "REVEALED" | "EXPIRED"
  fullName: string
  expiresAt: string
}

export interface BankConfig extends BankAccountDetails {
  id: string
  isActive: boolean
}

export interface CryptoConfig extends CryptoWalletDetails {
  id: string
  isActive: boolean
}

export interface WalletConfig extends DigitalWalletDetails {
  id: string
  isActive: boolean
}

export interface PaymentMethodConfig {
  bank: BankConfig | null
  crypto: CryptoConfig[]
  digitalWallets: WalletConfig[]
}

export interface AuditLogEntry {
  id: string
  actorId: string | null
  actor: { username: string; email: string } | null
  action: string
  targetType: string | null
  targetId: string | null
  before: unknown
  after: unknown
  ip: string | null
  createdAt: string
}

/* ---------------------------------------------------------- admin: plans */

/**
 * A plan as the admin sees it — the public shape plus the two fields the
 * marketing view has no use for, and the book currently riding on it.
 */
export interface AdminPlan extends Plan {
  isActive: boolean
  sortOrder: number
  subscriptions: {
    total: number
    active: number
    /** Sum of live principal, so retiring a tier shows what it would strand. */
    activePrincipal: string
  }
}

/** Basis points, matching the column — 250 is 2.50% per day. */
export interface PlanInput {
  slug: string
  name: string
  dailyReturnBps: number
  durationDays: number
  minDeposit: number
  maxDeposit: number | null
  referralBonusPercent: number
  description: string
  features: string[]
  isPopular: boolean
  isActive: boolean
  sortOrder: number
}

export interface AdminSubscriptionRow {
  id: string
  user: QueueUser
  planName: string
  planSlug: string
  principal: string
  totalAccrued: string
  status: SubscriptionStatus
  startedAt: string
  endsAt: string
  lastAccruedOn: string | null
}

/* ------------------------------------------------------- username checking */

export type UsernameUnavailableReason = "taken" | "reserved" | "invalid"

/**
 * Advisory. `register` re-checks and can still return a 409, because someone
 * may claim the name between this answer and the submit.
 */
export interface UsernameCheck {
  username: string
  available: boolean
  reason?: UsernameUnavailableReason
  message?: string
  /** Free, legal alternatives — empty when the name is available. */
  suggestions: string[]
}

/**
 * The shareable proof-of-payment document. Deliberately does NOT carry the
 * account balance: the page is reachable by anyone holding the link, and a
 * client forwarding proof of one payment should not be disclosing the rest of
 * their account.
 */
export interface ReceiptLink {
  reference: string
  token: string
  url: string
  issuedAt: string
  /** False when the receipt already existed and was returned unchanged. */
  created: boolean
}

export interface PublicReceipt {
  reference: string
  issuedAt: string
  direction: TxType
  amount: string
  category: TxCategory
  description: string | null
  status: TxStatus
  date: string
  account: { name: string; uid: string }
}
