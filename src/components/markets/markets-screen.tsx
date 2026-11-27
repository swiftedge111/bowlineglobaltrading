"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CloudOff,
  Gauge,
  LayoutGrid,
  Search,
  Star,
  X,
} from "lucide-react"

import { TradingViewWidget } from "@/components/tradingview/widget"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/lib/api/endpoints"
import { formatMoney, formatPercent } from "@/lib/format"
import {
  classTone,
  instruments,
  marketClasses,
  tapeSymbols,
  type Instrument,
  type MarketClass,
} from "@/lib/markets"
import { useAsyncData } from "@/lib/use-async-data"
import { cn } from "@/lib/utils"

/**
 * The Markets tab: our own watchlist driving TradingView's widgets.
 *
 * The list, tabs, search and stars are ours, so they match the rest of the app
 * and keep working if TradingView is slow. Each widget is keyed by what it
 * shows, because the wrapper injects its script once per mount; changing the
 * symbol means a fresh widget, not a reconfigured one.
 */

const BRAND = "rgba(0, 108, 165, 1)"
const GRID = "rgba(207, 223, 235, 0.55)"

const INTERVALS = [
  { value: "60", label: "1H" },
  { value: "240", label: "4H" },
  { value: "D", label: "1D" },
  { value: "W", label: "1W" },
] as const

type Tab = MarketClass | "Starred"

const STARRED_KEY = "bowline.markets.starred"
const SELECTED_KEY = "bowline.markets.selected"

const card = "rounded-[1.5rem] border border-secondary-200 bg-white shadow-sm"

const focusRing =
  "outline-none focus-visible:ring-4 focus-visible:ring-primary-200"

/* Per-viewer conveniences. Storage can be blocked; the page works without it. */
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Non-fatal. */
  }
}

const tvLink = (symbol: string) =>
  `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`

export function MarketsScreen() {
  // The signed-in shell renders only on the client (it waits for the session),
  // so reading storage in the initialisers cannot cause a hydration mismatch.
  const [starred, setStarred] = useState<string[]>(() =>
    readStorage<string[]>(STARRED_KEY, ["BITSTAMP:BTCUSD", "FX:EURUSD", "TVC:GOLD"])
  )
  const [selectedTv, setSelectedTv] = useState<string>(() => {
    const saved = readStorage<string>(SELECTED_KEY, "BITSTAMP:BTCUSD")
    return instruments.some((item) => item.tv === saved) ? saved : "BITSTAMP:BTCUSD"
  })
  const [tab, setTab] = useState<Tab>(() => {
    const saved = readStorage<string>(SELECTED_KEY, "BITSTAMP:BTCUSD")
    return instruments.find((item) => item.tv === saved)?.class ?? "Crypto"
  })
  const [query, setQuery] = useState("")
  const [chartInterval, setChartInterval] = useState<(typeof INTERVALS)[number]["value"]>("D")
  const [heatmap, setHeatmap] = useState<"crypto" | "stocks">("crypto")

  const chartRef = useRef<HTMLElement>(null)
  const selected = instruments.find((item) => item.tv === selectedTv) ?? instruments[0]!

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      return instruments.filter(
        (item) =>
          item.ticker.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
      )
    }
    if (tab === "Starred") {
      return instruments.filter((item) => starred.includes(item.tv))
    }
    return instruments.filter((item) => item.class === tab)
  }, [query, tab, starred])

  const select = (item: Instrument) => {
    setSelectedTv(item.tv)
    writeStorage(SELECTED_KEY, item.tv)
    // Below the two-column layout the chart sits above the list; bring it back
    // into view so a tap visibly does something.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const toggleStar = (tv: string) => {
    setStarred((current) => {
      const next = current.includes(tv)
        ? current.filter((value) => value !== tv)
        : [...current, tv]
      writeStorage(STARRED_KEY, next)
      return next
    })
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl leading-[1.08] font-semibold tracking-[-0.05em] sm:text-4xl">
            Markets,{" "}
            <span className="inline-block font-serif font-normal text-primary-600 italic">
              live.
            </span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-secondary-600 sm:text-base">
            Follow forex, crypto, stocks, indices and commodities. Pick an instrument to
            open its chart and technical outlook.
          </p>
        </div>
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-secondary-200 bg-white py-1.5 pr-3.5 pl-2.5 text-xs font-semibold text-secondary-700 shadow-sm">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Live data from TradingView
        </p>
      </div>

      {/* Ticker tape */}
      <div className={cn(card, "overflow-hidden px-1")}>
        <TradingViewWidget
          script="ticker-tape"
          className="h-[46px]"
          config={{
            symbols: tapeSymbols.map((tv) => ({
              proName: tv,
              title: instruments.find((item) => item.tv === tv)?.name ?? tv,
            })),
            showSymbolLogo: true,
            isTransparent: true,
            displayMode: "compact",
            colorTheme: "light",
            locale: "en",
          }}
        />
      </div>

      {/* Workspace */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        {/* Watchlist */}
        <section
          aria-labelledby="watchlist-title"
          className={cn(card, "flex min-w-0 flex-col overflow-hidden lg:h-[44rem]")}
        >
          <div className="border-b border-secondary-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 id="watchlist-title" className="font-sans text-base font-semibold">
                Watchlist
              </h3>
              <span className="text-xs text-secondary-500 tabular-nums">
                {instruments.length} instruments
              </span>
            </div>

            <label className="relative mt-3 block">
              <span className="sr-only">Search instruments</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Bitcoin, EUR/USD, Gold…"
                className="h-10 w-full rounded-xl border border-secondary-200 bg-secondary-50 pr-9 pl-9 text-sm placeholder:text-secondary-400 focus:border-primary-400 focus:bg-white focus:ring-4 focus:ring-primary-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className={cn("absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-secondary-400 hover:text-secondary-700", focusRing)}
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </label>

            {!query && (
              <div
                role="tablist"
                aria-label="Asset class"
                className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
              >
                {(["Starred", ...marketClasses] as Tab[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={tab === item}
                    onClick={() => setTab(item)}
                    className={cn(
                      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
                      focusRing,
                      tab === item
                        ? "bg-primary-700 text-white shadow-sm shadow-primary-700/25"
                        : "text-secondary-600 hover:bg-secondary-100 hover:text-secondary-900"
                    )}
                  >
                    {item === "Starred" && (
                      <Star aria-hidden className={cn("size-3.5", tab === item && "fill-current")} />
                    )}
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ul
            aria-label="Instruments"
            className="max-h-[26rem] flex-1 space-y-1 overflow-y-auto p-2 lg:max-h-none"
          >
            {visible.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-secondary-500">
                {query ? (
                  <>No instrument matches &ldquo;{query}&rdquo;.</>
                ) : (
                  <>Star an instrument to keep it here.</>
                )}
              </li>
            )}
            {visible.map((item) => {
              const active = item.tv === selected.tv
              const isStarred = starred.includes(item.tv)
              return (
                <li key={item.tv} className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => select(item)}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl py-2 pr-11 pl-2.5 text-left transition-colors",
                      focusRing,
                      active
                        ? "bg-primary-50 ring-1 ring-primary-200"
                        : "hover:bg-secondary-50"
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-full text-[10px] font-bold tracking-tight ring-1",
                        classTone[item.class]
                      )}
                    >
                      {item.ticker.replace("/", "").slice(0, 4)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm font-semibold text-secondary-900">
                        {item.ticker}
                      </span>
                      <span className="block truncate text-xs text-secondary-500">
                        {item.name}
                        {query && <> · {item.class}</>}
                      </span>
                    </span>
                    {active && (
                      <ArrowRight aria-hidden className="size-4 shrink-0 text-primary-600" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleStar(item.tv)}
                    aria-pressed={isStarred}
                    aria-label={isStarred ? `Unstar ${item.name}` : `Star ${item.name}`}
                    className={cn(
                      "absolute right-2 grid size-8 place-items-center rounded-lg transition-colors",
                      focusRing,
                      isStarred
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-secondary-300 hover:text-secondary-500"
                    )}
                  >
                    <Star aria-hidden className={cn("size-4", isStarred && "fill-current")} />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Chart */}
        <section
          ref={chartRef}
          aria-labelledby="chart-title"
          className={cn(card, "order-first flex min-w-0 scroll-mt-20 flex-col overflow-hidden lg:order-none lg:h-[44rem]")}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary-200 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-full text-[11px] font-bold ring-1",
                  classTone[selected.class]
                )}
              >
                {selected.ticker.replace("/", "").slice(0, 4)}
              </span>
              <div className="min-w-0">
                <h3 id="chart-title" className="flex items-center gap-2 font-sans text-lg font-semibold">
                  <span className="truncate font-mono">{selected.ticker}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", classTone[selected.class])}>
                    {selected.class}
                  </span>
                </h3>
                <p className="truncate text-sm text-secondary-500">{selected.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div role="group" aria-label="Chart interval" className="flex rounded-lg bg-secondary-100 p-0.5">
                {INTERVALS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={chartInterval === option.value}
                    onClick={() => setChartInterval(option.value)}
                    className={cn(
                      "min-h-8 min-w-10 rounded-md px-2 text-xs font-semibold transition-colors",
                      focusRing,
                      chartInterval === option.value
                        ? "bg-white text-primary-700 shadow-sm"
                        : "text-secondary-600 hover:text-secondary-900"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <a
                href={tvLink(selected.tv)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${selected.name} on TradingView`}
                title="Open on TradingView"
                className={cn("grid size-9 place-items-center rounded-lg border border-secondary-200 text-secondary-600 hover:border-primary-300 hover:text-primary-700", focusRing)}
              >
                <ArrowUpRight aria-hidden className="size-4" />
              </a>
            </div>
          </div>

          <TradingViewWidget
            key={`info:${selected.tv}`}
            script="symbol-info"
            // Sized by its iframe, which grows on narrow screens as it stacks.
            className="min-h-[6.5rem] shrink-0 border-b border-secondary-100 px-2"
            config={{
              symbol: selected.tv,
              width: "100%",
              locale: "en",
              colorTheme: "light",
              isTransparent: true,
            }}
          />

          <TradingViewWidget
            key={`chart:${selected.tv}:${chartInterval}`}
            script="advanced-chart"
            className="h-[26rem] min-h-0 flex-none lg:h-auto lg:flex-1"
            skeletonClassName="rounded-none"
            fallback={<ChartFallback instrument={selected} />}
            config={{
              autosize: true,
              symbol: selected.tv,
              interval: chartInterval,
              timezone: "Etc/UTC",
              theme: "light",
              style: "3",
              locale: "en",
              allow_symbol_change: false,
              hide_side_toolbar: true,
              hide_top_toolbar: false,
              hide_legend: false,
              save_image: false,
              calendar: false,
              withdateranges: true,
              backgroundColor: "rgba(255, 255, 255, 1)",
              gridColor: GRID,
              support_host: "https://www.tradingview.com",
              overrides: {
                "mainSeriesProperties.areaStyle.color1": "rgba(0, 108, 165, 0.22)",
                "mainSeriesProperties.areaStyle.color2": "rgba(0, 108, 165, 0)",
                "mainSeriesProperties.areaStyle.linecolor": BRAND,
                "mainSeriesProperties.areaStyle.linewidth": 2,
              },
            }}
          />
        </section>
      </div>

      {/* Outlook + plans */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="outlook-title" className={cn(card, "flex min-w-0 flex-col overflow-hidden")}>
          <div className="flex items-start gap-3 border-b border-secondary-200 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
              <Gauge aria-hidden className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h3 id="outlook-title" className="font-sans text-base font-semibold">
                Technical outlook · <span className="font-mono">{selected.ticker}</span>
              </h3>
              <p className="text-xs text-secondary-500">
                A summary of moving averages and oscillators. Not a recommendation to buy or sell.
              </p>
            </div>
          </div>
          <TradingViewWidget
            key={`ta:${selected.tv}`}
            script="technical-analysis"
            className="h-[26rem]"
            skeletonClassName="rounded-none"
            config={{
              interval: "1D",
              width: "100%",
              height: "100%",
              isTransparent: true,
              symbol: selected.tv,
              showIntervalTabs: true,
              displayMode: "single",
              locale: "en",
              colorTheme: "light",
            }}
          />
        </section>

        <PlansPromo />
      </div>

      {/* Heatmap */}
      <section aria-labelledby="heatmap-title" className={cn(card, "overflow-hidden")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100">
              <LayoutGrid aria-hidden className="size-4.5" />
            </span>
            <div>
              <h3 id="heatmap-title" className="font-sans text-base font-semibold">
                Market heatmap
              </h3>
              <p className="text-xs text-secondary-500">
                Block size is market value; colour is the day&apos;s move.
              </p>
            </div>
          </div>
          <div role="group" aria-label="Heatmap market" className="flex rounded-lg bg-secondary-100 p-0.5">
            {([
              ["crypto", "Crypto"],
              ["stocks", "S&P 500"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={heatmap === value}
                onClick={() => setHeatmap(value)}
                className={cn(
                  "min-h-8 rounded-md px-3 text-xs font-semibold transition-colors",
                  focusRing,
                  heatmap === value
                    ? "bg-white text-primary-700 shadow-sm"
                    : "text-secondary-600 hover:text-secondary-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {heatmap === "crypto" ? (
          <TradingViewWidget
            key="heatmap:crypto"
            script="crypto-coins-heatmap"
            className="h-[30rem] sm:h-[34rem]"
            skeletonClassName="rounded-none"
            config={{
              dataSource: "Crypto",
              blockSize: "market_cap_calc",
              blockColor: "24h_close_change|5",
              locale: "en",
              symbolUrl: "",
              colorTheme: "light",
              hasTopBar: false,
              isDataSetEnabled: false,
              isZoomEnabled: true,
              hasSymbolTooltip: true,
              isMonoSize: false,
              width: "100%",
              height: "100%",
            }}
          />
        ) : (
          <TradingViewWidget
            key="heatmap:stocks"
            script="stock-heatmap"
            className="h-[30rem] sm:h-[34rem]"
            skeletonClassName="rounded-none"
            config={{
              exchanges: [],
              dataSource: "SPX500",
              grouping: "sector",
              blockSize: "market_cap_basic",
              blockColor: "change",
              locale: "en",
              symbolUrl: "",
              colorTheme: "light",
              hasTopBar: false,
              isDataSetEnabled: false,
              isZoomEnabled: true,
              hasSymbolTooltip: true,
              isMonoSize: false,
              width: "100%",
              height: "100%",
            }}
          />
        )}
      </section>

      <p className="text-xs leading-relaxed text-secondary-500">
        Market data is provided by TradingView and may be delayed. Prices are indicative only
        and are not an offer to buy or sell any instrument.
      </p>
    </div>
  )
}

function ChartFallback({ instrument }: { instrument: Instrument }) {
  return (
    <div className="absolute inset-0 grid place-content-center justify-items-center bg-secondary-50 px-6 text-center">
      <CloudOff aria-hidden className="mb-3 size-7 text-primary-600" />
      <p role="status" className="font-semibold">The chart feed is unavailable right now.</p>
      <p className="mt-1 text-sm text-secondary-600">You can still open {instrument.name} on TradingView.</p>
      <Button asChild size="sm" variant="outline" className="mt-4">
        <a href={tvLink(instrument.tv)} target="_blank" rel="noreferrer">
          Open chart <ArrowUpRight aria-hidden />
        </a>
      </Button>
    </div>
  )
}

/** The bridge from watching markets to the product: plans, with live terms. */
function PlansPromo() {
  const plans = useAsyncData(() => api.plans.list(), "plans")

  return (
    <section
      aria-labelledby="plans-promo-title"
      className="relative isolate flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] bg-linear-to-br from-secondary-900 via-primary-900 to-primary-800 p-6 text-white shadow-xl shadow-primary-900/15 sm:p-7"
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-20 -z-10 size-72 rounded-full bg-sky-400/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-24 -z-10 size-72 rounded-full bg-primary-400/20 blur-3xl" />

      <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-sky-200 uppercase">
        <Activity aria-hidden className="size-4" /> Investment plans
      </p>
      <h3 id="plans-promo-title" className="mt-3 max-w-md text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
        Rather not watch every tick?
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-primary-100">
        Each plan states its daily return, term and minimum up front, and pays every 24 hours
        from the moment you subscribe.
      </p>

      <ul className="mt-6 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.05]">
        {plans.loading && !plans.data
          ? Array.from({ length: 4 }, (_, index) => (
              <li key={index} className="flex items-center justify-between px-4 py-3">
                <Skeleton className="h-4 w-20 bg-white/10" />
                <Skeleton className="h-4 w-14 bg-white/10" />
              </li>
            ))
          : (plans.data?.plans ?? []).map((plan) => (
              <li key={plan.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{plan.name}</p>
                  <p className="text-xs text-primary-100 tabular-nums">
                    From {formatMoney(plan.minDeposit)} · {plan.durationDays} days
                  </p>
                </div>
                <p className="shrink-0 text-right tabular-nums">
                  <span className="block text-sm font-semibold text-emerald-200">
                    {formatPercent(plan.dailyReturnPercent)}
                  </span>
                  <span className="block text-[11px] text-primary-100">daily</span>
                </p>
              </li>
            ))}
      </ul>

      <div className="mt-auto pt-6">
        <Button asChild variant="inverse">
          <Link href="/plans">
            Compare plans <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  )
}
