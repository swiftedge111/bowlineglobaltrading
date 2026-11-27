/**
 * Instruments shown in the signed-in Markets tab.
 *
 * `tv` is the TradingView symbol the widgets are fed. `ticker` is what we
 * print. The classes match the homepage's Market watch, plus indices.
 */

export const marketClasses = ["Forex", "Crypto", "Stocks", "Indices", "Commodities"] as const

export type MarketClass = (typeof marketClasses)[number]

export interface Instrument {
  tv: string
  ticker: string
  name: string
  class: MarketClass
}

export const instruments: Instrument[] = [
  { tv: "FX:EURUSD", ticker: "EUR/USD", name: "Euro / US Dollar", class: "Forex" },
  { tv: "FX:GBPUSD", ticker: "GBP/USD", name: "British Pound / US Dollar", class: "Forex" },
  { tv: "FX:USDJPY", ticker: "USD/JPY", name: "US Dollar / Japanese Yen", class: "Forex" },
  { tv: "FX:USDCHF", ticker: "USD/CHF", name: "US Dollar / Swiss Franc", class: "Forex" },
  { tv: "FX:AUDUSD", ticker: "AUD/USD", name: "Australian Dollar / US Dollar", class: "Forex" },
  { tv: "FX:USDCAD", ticker: "USD/CAD", name: "US Dollar / Canadian Dollar", class: "Forex" },

  { tv: "BITSTAMP:BTCUSD", ticker: "BTC", name: "Bitcoin", class: "Crypto" },
  { tv: "BITSTAMP:ETHUSD", ticker: "ETH", name: "Ethereum", class: "Crypto" },
  { tv: "BINANCE:SOLUSDT", ticker: "SOL", name: "Solana", class: "Crypto" },
  { tv: "BINANCE:XRPUSDT", ticker: "XRP", name: "XRP", class: "Crypto" },
  { tv: "BINANCE:ADAUSDT", ticker: "ADA", name: "Cardano", class: "Crypto" },
  { tv: "BINANCE:DOGEUSDT", ticker: "DOGE", name: "Dogecoin", class: "Crypto" },

  { tv: "NASDAQ:AAPL", ticker: "AAPL", name: "Apple", class: "Stocks" },
  { tv: "NASDAQ:MSFT", ticker: "MSFT", name: "Microsoft", class: "Stocks" },
  { tv: "NASDAQ:NVDA", ticker: "NVDA", name: "NVIDIA", class: "Stocks" },
  { tv: "NASDAQ:TSLA", ticker: "TSLA", name: "Tesla", class: "Stocks" },
  { tv: "NASDAQ:AMZN", ticker: "AMZN", name: "Amazon", class: "Stocks" },
  { tv: "NASDAQ:GOOGL", ticker: "GOOGL", name: "Alphabet", class: "Stocks" },

  { tv: "FOREXCOM:SPXUSD", ticker: "SPX", name: "S&P 500", class: "Indices" },
  { tv: "FOREXCOM:NSXUSD", ticker: "NDX", name: "Nasdaq 100", class: "Indices" },
  { tv: "FOREXCOM:DJI", ticker: "DJI", name: "Dow Jones 30", class: "Indices" },
  { tv: "FOREXCOM:UKXGBP", ticker: "FTSE", name: "FTSE 100", class: "Indices" },
  { tv: "XETR:DAX", ticker: "DAX", name: "DAX 40", class: "Indices" },

  { tv: "TVC:GOLD", ticker: "XAU", name: "Gold", class: "Commodities" },
  { tv: "TVC:SILVER", ticker: "XAG", name: "Silver", class: "Commodities" },
  { tv: "TVC:USOIL", ticker: "WTI", name: "Crude Oil", class: "Commodities" },
  { tv: "TVC:UKOIL", ticker: "BRENT", name: "Brent Oil", class: "Commodities" },
  { tv: "CAPITALCOM:NATURALGAS", ticker: "NATGAS", name: "Natural Gas", class: "Commodities" },
  { tv: "TVC:PLATINUM", ticker: "XPT", name: "Platinum", class: "Commodities" },
]

/** Fed to the ticker tape: one or two headline names from each class. */
export const tapeSymbols = [
  "FOREXCOM:SPXUSD",
  "FOREXCOM:NSXUSD",
  "BITSTAMP:BTCUSD",
  "BITSTAMP:ETHUSD",
  "FX:EURUSD",
  "FX:GBPUSD",
  "TVC:GOLD",
  "TVC:USOIL",
  "NASDAQ:NVDA",
  "NASDAQ:AAPL",
]

/** Badge colours per class, so a row reads at a glance. */
export const classTone: Record<MarketClass, string> = {
  Forex: "bg-primary-50 text-primary-700 ring-primary-100",
  Crypto: "bg-amber-50 text-amber-700 ring-amber-100",
  Stocks: "bg-violet-50 text-violet-700 ring-violet-100",
  Indices: "bg-sky-50 text-sky-700 ring-sky-100",
  Commodities: "bg-emerald-50 text-emerald-700 ring-emerald-100",
}
