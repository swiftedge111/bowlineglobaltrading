import {
  BadgeDollarSign,
  BarChart3,
  Bitcoin,
  CandlestickChart,
  CheckCircle2,
  Coins,
  CreditCard,
  Gem,
  Globe,
  LineChart,
  Lock,
  PieChart,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react"

/* -------------------------------------------------------------------------- */
/*  Company                                                                    */
/* -------------------------------------------------------------------------- */

const shortName = "Bowline Global"
const wordmarkSuffix = "Trading"
const name = `${shortName} ${wordmarkSuffix}`
const phone = process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || undefined
const vercelProductionDomain = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL?.trim()

export const company = {
  name,
  shortName,
  wordmarkSuffix,
  tagline: "Markets & Investing",
  description:
    "Explore forex, crypto, stocks, and commodities. Compare investment plans and track your portfolio in one place.",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || undefined,
  phone,
  phoneHref: phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : undefined,
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    (vercelProductionDomain ? `https://${vercelProductionDomain}` : "http://localhost:3000"),
  address: process.env.NEXT_PUBLIC_OFFICE_ADDRESS?.trim() || undefined,
}

export const supportContact = company.email
  ? { href: `mailto:${company.email}`, label: `Email ${company.email}` }
  : company.phoneHref
    ? { href: company.phoneHref, label: `Call ${company.phone}` }
    : undefined

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                 */
/* -------------------------------------------------------------------------- */

export interface NavLink {
  label: string
  href: string
}

export const navLinks: NavLink[] = [
  { label: "Markets", href: "#markets" },
  { label: "Platform", href: "#platform" },
  { label: "Plans", href: "#plans" },
  { label: "Why Us", href: "#why-us" },
  { label: "FAQ", href: "#faq" },
]

export const footerLinks: { title: string; links: NavLink[] }[] = [
  {
    title: "Markets",
    links: [
      { label: "Market Directory", href: "#market-directory" },
      { label: "Market Comparison", href: "#markets" },
      { label: "Market Watch", href: "#live-markets" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Trading Workspace", href: "#platform" },
      { label: "Copy Trading", href: "#copy-trading" },
      { label: "Investment Plans", href: "#plans" },
      { label: "How It Works", href: "#how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Why Bowline", href: "#why-us" },
      { label: "Testimonials", href: "#testimonials" },
      { label: "FAQ", href: "#faq" },
      { label: "Risk Disclosure", href: "#risk-disclosure" },
      ...(supportContact ? [{ label: "Contact Support", href: supportContact.href }] : []),
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Open an Account", href: "/signup" },
      { label: "Sign In", href: "/login" },
      { label: "Reset Password", href: "/forgot-password" },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/*  Hero stats                                                                 */
/* -------------------------------------------------------------------------- */

export interface Stat {
  /** Numeric target for the count-up animation */
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  label: string
}

export const stats: Stat[] = [
  { value: 10000, suffix: "+", label: "Active investors" },
  { value: 1000, suffix: "+", label: "Tradable instruments" },
  { value: 100, suffix: "+", label: "Countries served" },
  { value: 2.4, prefix: "$", suffix: "B+", decimals: 1, label: "Volume traded" },
]

/* -------------------------------------------------------------------------- */
/*  Markets                                                                    */
/* -------------------------------------------------------------------------- */

export interface Market {
  name: string
  slug: string
  description: string
  instruments: string
  spread: string
  icon: LucideIcon
  /** Tailwind gradient pair used for the icon tile and hover tint */
  gradient: string
}

export const markets: Market[] = [
  {
    name: "Forex",
    slug: "forex",
    description:
      "Trade the world's most liquid market around the clock, from major pairs to exotics, with deep liquidity and rapid execution.",
    instruments: "60+ currency pairs",
    spread: "From 0.1 pips",
    icon: Globe,
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    name: "Cryptocurrencies",
    slug: "crypto",
    description:
      "Access Bitcoin, Ethereum, Solana and more, traded 24/7 with secure custody and no hidden conversion fees.",
    instruments: "80+ digital assets",
    spread: "From 0.5%",
    icon: Bitcoin,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    name: "Stocks & Indices",
    slug: "stocks",
    description:
      "Take positions on the companies and indices shaping the global economy, from the S&P 500 to individual blue chips.",
    instruments: "700+ shares & indices",
    spread: "Zero commission",
    icon: CandlestickChart,
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    name: "Commodities",
    slug: "commodities",
    description:
      "Hedge and diversify with gold, silver, oil and natural gas — the assets investors turn to when markets turn.",
    instruments: "25+ commodities",
    spread: "From 0.3 pips",
    icon: Coins,
    gradient: "from-emerald-500 to-teal-500",
  },
]

/* -------------------------------------------------------------------------- */
/*  Why us                                                                     */
/* -------------------------------------------------------------------------- */

export interface Feature {
  title: string
  description: string
  icon: LucideIcon
  gradient: string
}

export const features: Feature[] = [
  {
    title: "Privacy first",
    description:
      "Your data is encrypted end to end and never sold. Account details stay between you and your dedicated manager.",
    icon: Lock,
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    title: "Reliable execution",
    description:
      "Orders fill in milliseconds on infrastructure built for volatility, with 99.9% platform uptime.",
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    title: "Scales with you",
    description:
      "Start with $250 or run a seven-figure book. The platform, tools and support grow alongside your portfolio.",
    icon: Rocket,
    gradient: "from-indigo-500 to-violet-500",
  },
  {
    title: "Funds protected",
    description:
      "Client capital is held in segregated accounts, with cold-storage custody for digital assets and negative-balance protection.",
    icon: ShieldCheck,
    gradient: "from-sky-500 to-blue-600",
  },
  {
    title: "Genuinely low fees",
    description:
      "Tight spreads, zero commission on stocks and no deposit charges. What you earn is what you keep.",
    icon: BadgeDollarSign,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    title: "1,000+ instruments",
    description:
      "One account covering forex, crypto, stocks, indices and commodities — diversify without ever leaving the platform.",
    icon: Gem,
    gradient: "from-fuchsia-500 to-pink-500",
  },
]

/* -------------------------------------------------------------------------- */
/*  Platform tools                                                             */
/* -------------------------------------------------------------------------- */

export interface TradingTool {
  title: string
  description: string
  icon: LucideIcon
  highlights: string[]
  badge?: string
}

export const tradingTools: TradingTool[] = [
  {
    title: "Advanced charting",
    description:
      "Full TradingView integration with over 100 technical indicators, drawing tools and multi-chart layouts.",
    icon: LineChart,
    highlights: ["75+ built-in indicators", "Custom alerts", "Multi-timeframe"],
    badge: "Pro",
  },
  {
    title: "Risk calculator",
    description:
      "Size every position against your risk tolerance and stop loss before you commit a cent of capital.",
    icon: BarChart3,
    highlights: ["Custom risk parameters", "Portfolio-based", "Multi-asset"],
  },
  {
    title: "Portfolio analyzer",
    description:
      "See your allocation, correlation and performance across every asset class in a single view.",
    icon: PieChart,
    highlights: ["Asset correlation", "Performance metrics", "Rebalancing alerts"],
    badge: "Pro",
  },
]

export const toolBenefits: Feature[] = [
  {
    title: "Included with every account",
    description:
      `Every tool is available to all ${company.name} members at no extra cost — no upsells, no locked tiers.`,
    icon: CheckCircle2,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    title: "One-click integration",
    description:
      "Tools read directly from your live account data and open positions. Nothing to configure.",
    icon: Rocket,
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    title: "Built for mobile",
    description:
      "Full functionality on desktop, tablet and phone. Manage risk from anywhere the market finds you.",
    icon: TrendingUp,
    gradient: "from-indigo-500 to-violet-500",
  },
]

/* -------------------------------------------------------------------------- */
/*  How it works                                                               */
/* -------------------------------------------------------------------------- */

export const steps = [
  {
    title: "Create your account",
    description:
      "Fill in your contact details, pick a username, and choose a password.",
  },
  {
    title: "Add funds",
    description:
      "Choose a deposit method and check your account for payment confirmation.",
  },
  {
    title: "Choose a plan",
    description:
      "Compare plan terms and minimums before deciding how much to allocate.",
  },
  {
    title: "Track your portfolio",
    description:
      "Open your dashboard to see your balance, holdings, and performance.",
  },
]

/* -------------------------------------------------------------------------- */
/*  Copy trading                                                               */
/* -------------------------------------------------------------------------- */

export interface CopyTradingVideo {
  title: string
  description: string
  video: string
}

export const copyTradingVideos: CopyTradingVideo[] = [
  {
    title: "What is copy trading?",
    description:
      "The fundamentals — how mirroring another trader's positions actually works, in plain language.",
    video: "/videos/video-1.mp4",
  },
  {
    title: "Choosing the right traders",
    description:
      "How to read a trader's track record, drawdown and risk score before you allocate to them.",
    video: "/videos/video-2.mp4",
  },
  {
    title: "Maximizing your returns",
    description:
      "Allocation strategies for spreading capital across several traders and managing your downside.",
    video: "/videos/video-3.mp4",
  },
]

/* -------------------------------------------------------------------------- */
/*  Investment plans                                                           */
/* -------------------------------------------------------------------------- */

export interface Plan {
  name: string
  dailyReturn: string
  durationDays: number
  minDeposit: string
  maxDeposit: string
  description: string
  features: string[]
  popular?: boolean
}

export const plans: Plan[] = [
  {
    name: "Starter",
    dailyReturn: "1.2%",
    durationDays: 14,
    minDeposit: "$250",
    maxDeposit: "$4,999",
    description:
      "For first-time investors who want to learn the platform with capital they're comfortable with.",
    features: [
      "Access to all four markets",
      "Standard charting tools",
      "Email support",
      "Capital returned at term end",
      "5% referral bonus",
    ],
  },
  {
    name: "Silver",
    dailyReturn: "1.8%",
    durationDays: 21,
    minDeposit: "$5,000",
    maxDeposit: "$24,999",
    description:
      "For active traders ready to put a serious position to work across multiple asset classes.",
    features: [
      "Everything in Starter",
      "Full technical indicator suite",
      "Copy trading access",
      "Priority email & chat support",
      "7% referral bonus",
    ],
  },
  {
    name: "Gold",
    dailyReturn: "2.5%",
    durationDays: 30,
    minDeposit: "$25,000",
    maxDeposit: "$99,999",
    description:
      "Our most popular tier — full platform access with a dedicated manager watching your book.",
    features: [
      "Everything in Silver",
      "Dedicated account manager",
      "Portfolio analyzer & risk tools",
      "Priority withdrawals",
      "10% referral bonus",
      "Quarterly strategy review",
    ],
    popular: true,
  },
  {
    name: "Platinum",
    dailyReturn: "3.2%",
    durationDays: 45,
    minDeposit: "$100,000",
    maxDeposit: "Unlimited",
    description:
      "Institutional-grade terms for high-net-worth clients and professional capital allocators.",
    features: [
      "Everything in Gold",
      "Bespoke portfolio structuring",
      "24/7 direct line to your manager",
      "Same-day withdrawals",
      "15% referral bonus",
      "Custom risk mandates",
    ],
  },
]

/* -------------------------------------------------------------------------- */
/*  Testimonials                                                               */
/* -------------------------------------------------------------------------- */

export interface Testimonial {
  quote: string
  name: string
  location: string
  initials: string
}

export const testimonials: Testimonial[] = [
  {
    quote:
      "The best platform I've ever used. My portfolio has grown steadily since I started copy trading, and I finally understand what my money is actually doing.",
    name: "David Wilson",
    location: "California, USA",
    initials: "DW",
  },
  {
    quote:
      "I've been using the platform for months and the results speak for themselves. Withdrawals clear fast and my account manager actually picks up the phone.",
    name: "Sarah Lee",
    location: "London, UK",
    initials: "SL",
  },
  {
    quote:
      "Fantastic platform with genuinely excellent support. The risk calculator alone changed how I size every position I take.",
    name: "Raj Patel",
    location: "Mumbai, India",
    initials: "RP",
  },
]

/* -------------------------------------------------------------------------- */
/*  Trusted by                                                                 */
/* -------------------------------------------------------------------------- */

export interface Partner {
  name: string
  /** Omit to render the name as a typographic wordmark instead of an image. */
  logo?: string
}

export const partners: Partner[] = [
  { name: "Microsoft" },
  { name: "Tesla", logo: "/logos/tesla.png" },
  { name: "Amazon" },
  { name: "Google" },
  { name: "Visa", logo: "/logos/visa.png" },
  { name: "PayPal", logo: "/logos/paypal.png" },
]

/* -------------------------------------------------------------------------- */
/*  Deposit methods                                                            */
/* -------------------------------------------------------------------------- */

export interface DepositMethod {
  label: string
  icon: LucideIcon
}

export const depositMethods: DepositMethod[] = [
  { label: "Bank transfer", icon: Wallet },
  { label: "Credit & debit card", icon: CreditCard },
  { label: "Cryptocurrency", icon: Bitcoin },
  { label: "Digital wallets", icon: Coins },
]

/* -------------------------------------------------------------------------- */
/*  FAQ                                                                        */
/* -------------------------------------------------------------------------- */

export const faqTopics = ["Getting started", "Deposits & withdrawals", "Trading & risk"] as const

export interface FaqItem {
  question: string
  answer: string
  topic: (typeof faqTopics)[number]
  link?: NavLink
}

export const faqs: FaqItem[] = [
  {
    question: "How do I open an account?",
    answer:
      "Enter your name and contact details on the signup page, then choose a username and password. After signup, the welcome screen will guide you through setting up your account.",
    topic: "Getting started",
    link: { label: "Open an account", href: "/signup" },
  },
  {
    question: "What is the minimum deposit?",
    answer:
      "The Deposit page in your account shows the current minimum deposit. Each investment plan has its own minimum amount, which you can compare in the Plans section.",
    topic: "Deposits & withdrawals",
    link: { label: "Compare plan minimums", href: "#plans" },
  },
  {
    question: "Which markets can I follow?",
    answer:
      "Market Watch covers forex, cryptocurrencies, stocks and indices, and commodities. You can browse prices for instruments such as Bitcoin, EUR/USD, and gold.",
    topic: "Trading & risk",
    link: { label: "Visit Market Watch", href: "#live-markets" },
  },
  {
    question: "How do I deposit and withdraw funds?",
    answer:
      "In Deposit, choose an available payment method and follow the payment instructions. In Withdraw, choose a bank account or crypto wallet as the destination and confirm the request with your withdrawal PIN.",
    topic: "Deposits & withdrawals",
  },
  {
    question: "How long do withdrawals take?",
    answer:
      "Your withdrawal shows as pending while the team reviews it. You can check its latest status from Withdraw or Transactions in your account.",
    topic: "Deposits & withdrawals",
  },
  {
    question: "Are my funds safe?",
    answer:
      "Your account uses a password for sign-in and a PIN for withdrawal requests. Trading itself carries risk, including the potential loss of some or all of your invested capital.",
    topic: "Trading & risk",
    link: { label: "Read the risk disclosure", href: "#risk-disclosure" },
  },
  {
    question: "What is copy trading and how does it work?",
    answer:
      "Copy trading mirrors another trader’s positions. With proportional copying, each position uses the same share of the money you set aside as it does in the original strategy.",
    topic: "Trading & risk",
    link: { label: "See the copy trading example", href: "#copy-trading" },
  },
  {
    question: "Do I need trading experience to get started?",
    answer:
      "You can browse markets and try the price calculator before opening an account. The calculator shows how a hypothetical price change affects the value of a position.",
    topic: "Getting started",
    link: { label: "Try the price calculator", href: "#platform" },
  },
  {
    question: "Where can I see withdrawal fees?",
    answer:
      "The Withdraw page shows the processing fee and the amount you would receive before you confirm a request.",
    topic: "Deposits & withdrawals",
  },
  {
    question: "Is trading risky?",
    answer:
      "Yes. Prices can move sharply, and you may lose some or all of the money you invest. Future performance can differ from past results.",
    topic: "Trading & risk",
    link: { label: "Read the risk disclosure", href: "#risk-disclosure" },
  },
]

/* -------------------------------------------------------------------------- */
/*  TradingView symbols                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Instruments shown in the marquee strip under the hero. These are names only,
 * deliberately not prices — the live figures live in the market overview below,
 * sourced from TradingView.
 */
export interface TickerInstrument {
  symbol: string
  name: string
  category: "Forex" | "Crypto" | "Stocks" | "Commodities"
}

export const tickerInstruments: TickerInstrument[] = [
  { symbol: "EUR/USD", name: "Euro / US Dollar", category: "Forex" },
  { symbol: "BTC/USD", name: "Bitcoin", category: "Crypto" },
  { symbol: "AAPL", name: "Apple", category: "Stocks" },
  { symbol: "XAU/USD", name: "Gold", category: "Commodities" },
  { symbol: "GBP/USD", name: "Pound / US Dollar", category: "Forex" },
  { symbol: "ETH/USD", name: "Ethereum", category: "Crypto" },
  { symbol: "TSLA", name: "Tesla", category: "Stocks" },
  { symbol: "WTI", name: "Crude Oil", category: "Commodities" },
  { symbol: "USD/JPY", name: "Dollar / Yen", category: "Forex" },
  { symbol: "SOL/USD", name: "Solana", category: "Crypto" },
  { symbol: "SPX", name: "S&P 500", category: "Stocks" },
  { symbol: "XAG/USD", name: "Silver", category: "Commodities" },
]
