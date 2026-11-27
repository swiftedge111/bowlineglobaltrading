"use client"

import { useState } from "react"
import { ArrowDown, Rows3 } from "lucide-react"

import { tickerInstruments, type TickerInstrument } from "@/lib/site"
import { cn } from "@/lib/utils"

const categories = ["Forex", "Crypto", "Stocks", "Commodities"] as const

export function InstrumentDirectory() {
  const [category, setCategory] = useState<TickerInstrument["category"]>("Forex")
  const instruments = tickerInstruments.filter((item) => item.category === category)

  return (
    <section id="market-directory" aria-labelledby="directory-title" className="bg-secondary-900 text-white">
      <div className="container-px py-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <h2 id="directory-title" className="flex items-center gap-2.5 text-lg font-medium tracking-tight">
            <Rows3 aria-hidden className="size-5 text-primary-300" /> Market directory
          </h2>
          <a href="#live-markets" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary-200 hover:text-white">
            View live prices <ArrowDown aria-hidden className="size-4" />
          </a>
        </div>
        <div className="mt-3 grid items-center gap-5 border-t border-white/15 pt-4 lg:grid-cols-[auto_1fr] lg:gap-12">
          <div role="group" aria-label="Market category" className="flex flex-wrap gap-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={category === item}
                aria-controls="directory-instruments"
                onClick={() => setCategory(item)}
                className={cn(
                  "min-h-11 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 sm:px-4",
                  category === item ? "bg-primary-100 text-primary-950" : "text-secondary-300 hover:bg-white/10 hover:text-white"
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <div id="directory-instruments" aria-live="polite" aria-atomic="true">
            <ul aria-label={category + " instruments"} className="grid grid-cols-3 divide-x divide-white/15">
              {instruments.map(({ symbol, name }) => (
                <li key={symbol} className="min-w-0 px-2 first:pl-0 sm:px-5">
                  <p className="font-mono text-base font-medium tracking-tight sm:text-lg">{symbol}</p>
                  <p className="mt-0.5 text-xs leading-snug text-secondary-300 sm:text-sm">{name}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
