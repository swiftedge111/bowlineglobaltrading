"use client"

import { useId, useState } from "react"
import { ArrowUpRight, Calculator, CandlestickChart } from "lucide-react"

import { Section } from "@/components/site/section"
import { TradingViewWidget } from "@/components/tradingview/widget"
import { cn } from "@/lib/utils"

const chartConfig = {
  autosize: true,
  symbol: "BITSTAMP:BTCUSD",
  interval: "60",
  timezone: "Etc/UTC",
  theme: "dark",
  style: "1",
  locale: "en",
  backgroundColor: "#122d44",
  gridColor: "rgba(255, 255, 255, 0.06)",
  hide_side_toolbar: true,
  allow_symbol_change: true,
  save_image: false,
  calendar: false,
  support_host: "https://www.tradingview.com",
}
const chartUrl = "https://www.tradingview.com/chart/?symbol=BITSTAMP%3ABTCUSD"
const tools = [
  { name: "Price calculator", icon: Calculator },
  { name: "Advanced chart", icon: CandlestickChart },
] as const
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })

export function Platform() {
  const [tool, setTool] = useState<(typeof tools)[number]["name"]>("Price calculator")
  const [startingValue, setStartingValue] = useState(1000)
  const [move, setMove] = useState(5)
  const moveId = useId()
  const change = startingValue * move / 100
  const result = startingValue + change
  const maxValue = Math.max(result, startingValue)

  return (
    <Section id="platform" aria-labelledby="platform-title" className="bg-secondary-900 text-white">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <h2 id="platform-title" className="text-4xl leading-[1.05] font-semibold tracking-[-0.055em] sm:text-5xl xl:text-6xl">
          Trading <span className="font-serif font-normal text-primary-300 italic">workspace.</span>
        </h2>
        <div role="group" aria-label="Trading tools" className="flex flex-wrap gap-1 rounded-xl bg-white/10 p-1">
          {tools.map(({ name, icon: Icon }) => (
            <button key={name} type="button" aria-pressed={tool === name} onClick={() => setTool(name)}
              className={cn("flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary-300 sm:px-4", tool === name ? "bg-white text-secondary-900" : "text-primary-100 hover:bg-white/10")}>
              <Icon aria-hidden className="hidden size-4 sm:block" />{name}
            </button>
          ))}
        </div>
      </div>
      {tool === "Price calculator" ? (
        <div className="grid overflow-hidden rounded-2xl border border-white/15 bg-white text-secondary-900 md:grid-cols-2">
          <div className="p-5 sm:p-8 lg:p-10">
            <h3 className="text-2xl font-semibold tracking-tight">What if the price moves?</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-secondary-600">Choose a starting value and a price change to explore a hypothetical long position.</p>
            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-semibold">Starting value</legend>
              <div className="flex flex-wrap gap-2">
                {[500, 1000, 5000].map((value) => (
                  <button type="button" key={value} aria-pressed={value === startingValue} onClick={() => setStartingValue(value)}
                    className={cn("min-h-11 rounded-lg border px-3 text-sm font-medium focus-visible:outline-primary-600", value === startingValue ? "border-primary-600 bg-primary-50 text-primary-700" : "border-secondary-200 hover:bg-secondary-50")}>
                    ${value.toLocaleString("en-US")}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="mt-6">
              <div className="flex justify-between text-sm font-semibold">
                <label htmlFor={moveId}>Price change</label><span>{move > 0 ? "+" : ""}{move}%</span>
              </div>
              <input id={moveId} type="range" min="-20" max="20" step="1" value={move} aria-valuetext={move + " percent"} onChange={event => setMove(event.target.valueAsNumber)} className="block h-9 w-full accent-primary-600" />
              <div aria-hidden className="flex justify-between text-xs text-secondary-500"><span>−20%</span><span>0%</span><span>+20%</span></div>
            </div>
          </div>
          <div className="flex flex-col justify-center bg-primary-50 p-5 sm:p-8 lg:p-10">
            <p className="text-sm font-medium text-primary-800">Projected position value</p>
            <output aria-live="polite" className="mt-1 font-heading text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{usd.format(result)}</output>
            <p className="mt-2 text-sm text-secondary-600">{change > 0 ? "+" : ""}{usd.format(change)} before fees</p>
            <div className="mt-7 space-y-3" aria-hidden>
              {[{ label: "Starting value", value: startingValue, color: "bg-secondary-300" }, { label: "Projected value", value: result, color: "bg-primary-600" }].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="mb-1 text-xs text-secondary-600">{label}</p>
                  <div className={cn("h-2 rounded-full motion-safe:transition-[width]", color)} style={{ width: (value / maxValue * 100) + "%" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/20">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white/10 px-5 py-3">
            <h3 className="font-medium">TradingView chart</h3>
            <a href={chartUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm text-primary-200 hover:underline">Open TradingView <ArrowUpRight aria-hidden className="size-4" /></a>
          </div>
          <TradingViewWidget script="advanced-chart" config={chartConfig} className="h-[420px] sm:h-[500px]" skeletonClassName="bg-white/10"
            fallback={<div className="absolute inset-0 grid place-content-center gap-2 bg-primary-950 p-6 text-center">
              <p role="status">The embedded chart is unavailable.</p>
              <a href={chartUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-1 text-primary-200 underline">View the Bitcoin chart <ArrowUpRight aria-hidden className="size-4" /></a>
            </div>}
          />
        </div>
      )}
    </Section>
  )
}
