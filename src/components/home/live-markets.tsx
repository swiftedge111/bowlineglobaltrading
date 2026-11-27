import { Activity, ArrowUpRight, CloudOff } from "lucide-react"

import { Section } from "@/components/site/section"
import { TradingViewWidget } from "@/components/tradingview/widget"

const watchlist = {
  colorTheme: "light",
  dateRange: "12M",
  showChart: true,
  locale: "en",
  largeChartUrl: "",
  isTransparent: false,
  showSymbolLogo: true,
  showFloatingTooltip: true,
  width: "100%",
  height: "100%",
  plotLineColorGrowing: "rgba(0, 108, 165, 1)",
  plotLineColorFalling: "rgba(239, 68, 68, 1)",
  gridLineColor: "rgba(226, 232, 240, 1)",
  scaleFontColor: "rgba(100, 116, 139, 1)",
  belowLineFillColorGrowing: "rgba(0, 108, 165, 0.12)",
  belowLineFillColorFalling: "rgba(239, 68, 68, 0.12)",
  belowLineFillColorGrowingBottom: "rgba(0, 108, 165, 0)",
  belowLineFillColorFallingBottom: "rgba(239, 68, 68, 0)",
  symbolActiveColor: "rgba(214, 239, 255, 1)",
  tabs: [
    {
      title: "Forex",
      symbols: [
        { s: "FX:EURUSD", d: "EUR to USD" },
        { s: "FX:GBPUSD", d: "GBP to USD" },
        { s: "FX:USDJPY", d: "USD to JPY" },
        { s: "FX:USDCHF", d: "USD to CHF" },
        { s: "FX:AUDUSD", d: "AUD to USD" },
        { s: "FX:USDCAD", d: "USD to CAD" },
      ],
      originalTitle: "Forex",
    },
    {
      title: "Crypto",
      symbols: [
        { s: "BITSTAMP:BTCUSD", d: "Bitcoin" },
        { s: "BITSTAMP:ETHUSD", d: "Ethereum" },
        { s: "BINANCE:SOLUSDT", d: "Solana" },
        { s: "BINANCE:XRPUSDT", d: "XRP" },
        { s: "BINANCE:ADAUSDT", d: "Cardano" },
        { s: "BINANCE:DOGEUSDT", d: "Dogecoin" },
      ],
      originalTitle: "Crypto",
    },
    {
      title: "Stocks",
      symbols: [
        { s: "NASDAQ:AAPL", d: "Apple" },
        { s: "NASDAQ:MSFT", d: "Microsoft" },
        { s: "NASDAQ:TSLA", d: "Tesla" },
        { s: "NASDAQ:AMZN", d: "Amazon" },
        { s: "NASDAQ:GOOGL", d: "Alphabet" },
        { s: "NASDAQ:NVDA", d: "NVIDIA" },
      ],
      originalTitle: "Stocks",
    },
    {
      title: "Commodities",
      symbols: [
        { s: "TVC:GOLD", d: "Gold" },
        { s: "TVC:SILVER", d: "Silver" },
        { s: "TVC:USOIL", d: "Crude Oil" },
        { s: "TVC:UKOIL", d: "Brent Oil" },
        { s: "CAPITALCOM:NATURALGAS", d: "Natural Gas" },
        { s: "TVC:PLATINUM", d: "Platinum" },
      ],
      originalTitle: "Commodities",
    },
  ],
}

const marketsUrl = "https://www.tradingview.com/markets/"

export function LiveMarkets() {
  return (
    <Section id="live-markets" aria-labelledby="live-markets-title" className="bg-white">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-12 gap-y-3">
        <h2 id="live-markets-title" className="text-4xl leading-[1.04] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl xl:text-6xl">
          Market <span className="font-serif font-normal text-primary-600 italic">watch.</span>
        </h2>
        <p className="max-w-sm leading-relaxed text-secondary-600">
          Choose an asset class, then select an instrument to explore its price history.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-secondary-200 bg-white shadow-lg shadow-secondary-900/5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-secondary-900 px-4 py-2 text-white sm:px-6">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Activity aria-hidden className="size-5 text-primary-300" /> Prices &amp; charts
          </h3>
          <a href={marketsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary-200 hover:text-white">
            Open TradingView <ArrowUpRight aria-hidden className="size-4" />
          </a>
        </div>
        <TradingViewWidget
          script="market-overview"
          config={watchlist}
          className="h-[540px] sm:h-[560px]"
          fallback={
            <div className="absolute inset-0 grid place-content-center bg-secondary-50 px-4">
              <CloudOff aria-hidden className="mb-3 size-7 text-primary-600" />
              <p role="status" className="font-semibold text-secondary-900">The chart feed is unavailable.</p>
              <p className="mt-1 text-sm text-secondary-600">Open an instrument directly on TradingView.</p>
              <ul className="mt-5 grid grid-cols-2 gap-2">
                {watchlist.tabs.map(({ title, symbols }) => (
                  <li key={title}>
                    <a
                      href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbols[0].s)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-full items-center justify-between gap-2 rounded-lg border border-secondary-200 bg-white p-3 hover:border-primary-600 focus-visible:outline-primary-600"
                    >
                      <span>
                        <span className="block text-xs text-secondary-500">{title}</span>
                        <span className="block text-sm font-semibold text-secondary-900">{symbols[0].d}</span>
                      </span>
                      <ArrowUpRight aria-hidden className="size-4 shrink-0 text-primary-600" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          }
        />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-secondary-500">
        Market data is provided by TradingView and may be delayed. Prices are indicative only.
      </p>
    </Section>
  )
}
