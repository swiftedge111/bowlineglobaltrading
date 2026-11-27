"use client"

import { useId, useState } from "react"
import { Bitcoin, ChartNoAxesCombined, Diamond } from "lucide-react"

import { formatMoney, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

const dailyBalances = [
  29840, 30070, 29910, 30210, 30140, 30360, 30280, 30470, 30860, 30770,
  30940, 30710, 30610, 30980, 31360, 31260, 31520, 31790, 31710, 32120,
  31960, 32370, 32220, 32680, 32560, 32610, 32210, 32370, 32280, 32480,
]

const holdings = [
  { name: "Bitcoin", symbol: "BTC", value: 19488, icon: Bitcoin, color: "bg-amber-100 text-amber-800", bar: "bg-amber-500" },
  { name: "Ethereum", symbol: "ETH", value: 12992, icon: Diamond, color: "bg-indigo-100 text-indigo-700", bar: "bg-indigo-500" },
]

const total = dailyBalances[dailyBalances.length - 1]

export function PortfolioPreview() {
  const [days, setDays] = useState(30)
  const fillId = useId()
  const balances = dailyBalances.slice(-days)
  const change = total - balances[0]
  const min = Math.min(...balances)
  const max = Math.max(...balances)
  const points = balances.map((value, i) => ({
    x: 4 + (i / (balances.length - 1)) * 392,
    y: 90 - ((value - min) / (max - min)) * 78,
  }))
  const line = points.map(({ x, y }, i) => `${i ? "L" : "M"}${x},${y}`).join(" ")
  const end = points[points.length - 1]

  return (
    <section aria-label="Sample portfolio" className="relative isolate mx-auto w-full max-w-xl rounded-[2rem] bg-primary-50 px-3 py-5 sm:px-7 sm:py-7">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit] bg-[repeating-radial-gradient(ellipse_at_top_right,transparent_0_20px,var(--color-primary-100)_21px,transparent_22px_34px)]" />
      <div className="mx-auto max-w-md overflow-hidden rounded-2xl bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 px-4 pt-5 pb-9 text-white shadow-xl shadow-primary-900/15 sm:px-6 sm:pt-6">
        <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-3">
          <h2 className="flex items-center gap-2 font-sans text-sm font-medium">
            <ChartNoAxesCombined aria-hidden className="size-5 text-primary-300" /> Portfolio overview
          </h2>
          <span className="text-xs text-primary-100">Sample data</span>
        </div>
        <p className="mt-4 text-xs font-medium text-primary-100">Portfolio value · USD</p>
        <p className="mt-1 font-heading text-4xl font-medium tracking-tight tabular-nums">{formatMoney(String(total))}</p>
        <p aria-live="polite" className="mt-1.5 text-xs tabular-nums">
          <span className={change >= 0 ? "text-emerald-200" : "text-rose-200"}>
            {formatMoney(String(change), { showPlus: true })} ({formatPercent((change / balances[0] * 100).toFixed(2), { showPlus: true })})
          </span>{" "}
          <span className="text-primary-100">over {days} days</span>
        </p>
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" role="img" aria-label={`Sample portfolio balance over ${days} days, from ${formatMoney(String(balances[0]))} to ${formatMoney(String(total))}`} className="mt-4 h-24 w-full sm:h-28">
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
              <stop stopColor="#7acdfa" stopOpacity=".38" />
              <stop offset="1" stopColor="#7acdfa" stopOpacity=".01" />
            </linearGradient>
          </defs>
          {[20, 50, 80].map(y => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="white" strokeOpacity=".15" strokeDasharray="2 5" />)}
          <path d={`${line} L396,100 L4,100 Z`} fill={`url(#${fillId})`} />
          <path d={line} fill="none" stroke="#89d9ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <circle cx={end.x} cy={end.y} r="3.5" fill="white" />
        </svg>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="text-primary-100">Past {days} days</span>
          <div role="group" aria-label="Chart period" className="flex">
            {[7, 14, 30].map(period => (
              <button key={period} type="button" aria-label={`${period} days`} aria-pressed={days === period}
                onClick={() => setDays(period)}
                className={cn("min-h-9 min-w-10 rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white", days === period ? "bg-white text-primary-900" : "text-primary-100 hover:bg-white/10")}>
                {period}D
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul aria-label="Sample holdings" className="relative mx-auto -mt-5 grid max-w-[26rem] grid-cols-2 gap-2 px-1 sm:gap-3">
        {holdings.map(({ name, symbol, value, icon: Icon, color, bar }) => {
          const share = Math.round(value / total * 100)
          return (
            <li key={symbol} className="rounded-xl border border-secondary-200 bg-white p-3 shadow-md shadow-primary-900/10 sm:p-4">
              <div className="flex items-center gap-2">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", color)}><Icon aria-hidden className="size-5" /></span>
                <div><p className="text-sm leading-tight font-semibold">{name}</p><p className="text-[11px] text-secondary-500">{symbol}</p></div>
              </div>
              <p className="mt-3 font-heading text-lg font-semibold tracking-tight tabular-nums sm:text-xl">{formatMoney(String(value))}</p>
              <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-secondary-100"><div className={cn("h-full rounded-full", bar)} style={{ width: `${share}%` }} /></div>
              <p className="mt-1.5 text-xs text-secondary-500">{share}% allocation</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
