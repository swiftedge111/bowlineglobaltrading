import Link from "next/link"
import { ArrowRight, ShieldCheck } from "lucide-react"

import { PortfolioPreview } from "@/components/home/portfolio-preview"
import { Button } from "@/components/ui/button"
import { stats } from "@/lib/site"

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden bg-white">
      <div className="container-px pt-28 pb-9 sm:pt-32 lg:pt-36">
        <div className="grid items-center gap-9 lg:grid-cols-[0.93fr_1.07fr] lg:gap-12">
          <div>
            <h1 id="hero-title" className="text-5xl leading-[1.02] font-semibold tracking-[-0.06em] text-secondary-900 sm:text-7xl xl:text-[5.25rem]">
              Four markets.
              <span className="block font-serif font-normal tracking-[-0.055em] text-primary-600 italic">One portfolio.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-secondary-600 sm:text-lg">
              Trade forex, crypto, stocks and commodities from one Bowline account, with spreads from 0.1 pips.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button asChild size="lg">
                <Link href="/signup">Open Your Account <ArrowRight /></Link>
              </Button>
              <Link href="#live-markets" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-700 underline decoration-primary-200 underline-offset-4 hover:decoration-primary-600">
                View Live Markets
              </Link>
            </div>
            <p className="mt-5 flex items-start gap-2 text-sm text-secondary-500">
              <ShieldCheck aria-hidden className="size-4 shrink-0 translate-y-0.5 text-primary-600" />
              Segregated client funds · Start from $250 · No deposit fees
            </p>
          </div>
          <PortfolioPreview />
        </div>
        <dl className="mt-9 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-secondary-200 pt-6 sm:grid-cols-4 lg:mt-12">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col">
              <dt className="mt-1 text-xs text-secondary-500 sm:text-sm">{stat.label}</dt>
              <dd className="order-first font-heading text-2xl font-semibold tracking-tight text-secondary-900 sm:text-3xl">
                {stat.prefix}{stat.value.toLocaleString("en-US")}{stat.suffix}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
