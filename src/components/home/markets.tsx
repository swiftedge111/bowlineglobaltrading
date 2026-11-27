import Image from "next/image"
import { ArrowDown } from "lucide-react"

import { Section } from "@/components/site/section"
import { markets } from "@/lib/site"

export function Markets() {
  return (
    <Section id="markets" aria-labelledby="markets-title" className="bg-secondary-50">
      <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <h2 id="markets-title" className="text-4xl leading-[1.04] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl xl:text-6xl">
            Compare the <span className="font-serif font-normal text-primary-600 italic">markets.</span>
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-secondary-600">
            Explore what you can trade on Bowline and how pricing varies across asset classes.
          </p>
          <table className="mt-7 w-full border-collapse text-left">
            <caption className="sr-only">Bowline instruments and pricing by asset class</caption>
            <thead className="border-b border-secondary-300 text-xs tracking-wide text-secondary-500">
              <tr>
                <th scope="col" className="pb-3 font-medium">Market &amp; coverage</th>
                <th scope="col" className="pb-3 text-right font-medium">Pricing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 border-b border-secondary-200">
              {markets.map((market) => (
                <tr key={market.slug}>
                  <th scope="row" className="py-3.5 pr-2">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="hidden size-10 shrink-0 items-center justify-center rounded-full border border-secondary-200 bg-white text-primary-700 min-[380px]:flex">
                        <market.icon aria-hidden className="size-4.5" />
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-secondary-900 sm:text-base">{market.name}</span>
                        <span className="mt-0.5 block text-xs font-normal text-secondary-600">{market.instruments}</span>
                      </div>
                    </div>
                  </th>
                  <td className="py-3.5 text-right text-sm font-medium text-secondary-900">{market.spread}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <a href="#live-markets" className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-primary-700 hover:underline">
            Explore market prices <ArrowDown aria-hidden className="size-4" />
          </a>
        </div>
        <Image
          src="/images/sections/market-watchlist.webp"
          alt="Illustrated watchlist showing the euro, Bitcoin, and gold."
          width={1536}
          height={1024}
          sizes="(min-width: 1280px) 550px, (min-width: 1024px) 45vw, 100vw"
          className="w-full rounded-2xl border border-secondary-200"
        />
      </div>
    </Section>
  )
}
