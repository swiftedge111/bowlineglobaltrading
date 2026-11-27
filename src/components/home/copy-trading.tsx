import Image from "next/image"

import { Section } from "@/components/site/section"
import { copyTradingVideos } from "@/lib/site"

export function CopyTrading() {
  return (
    <Section id="copy-trading" aria-labelledby="copy-trading-title" className="bg-secondary-50">
      <div className="grid items-center gap-7 lg:grid-cols-[1.06fr_1fr] lg:gap-14">
        <div className="lg:col-start-2 lg:row-start-1">
          <h2 id="copy-trading-title" className="text-4xl leading-[1.05] font-semibold tracking-[-0.055em] text-balance text-secondary-900 sm:text-5xl xl:text-6xl">
            Copy trading, <span className="inline-block font-serif font-normal text-primary-600 italic">explained.</span>
          </h2>
          <p className="mt-4 max-w-lg leading-relaxed text-secondary-600">
            In copy trading, you set aside an amount to mirror another trader’s strategy. Proportional copying uses the same share of that amount for each position.
          </p>
          <div className="mt-6 rounded-2xl border border-secondary-200 bg-white p-4 sm:p-5">
            <h3 className="text-base font-semibold text-secondary-900">Example allocation</h3>
            <p className="mt-1 text-sm leading-relaxed text-secondary-600">The trader puts 10% of their portfolio into one position.</p>
            <dl className="mt-4 grid grid-cols-2 border-t border-secondary-200 pt-4">
              <div className="pr-3">
                <dt className="text-sm leading-snug text-secondary-600">Amount set aside</dt>
                <dd className="mt-1 font-heading text-2xl font-semibold text-secondary-900">$500</dd>
              </div>
              <div className="border-l border-secondary-200 pl-4">
                <dt className="text-sm leading-snug text-secondary-600">Copied position</dt>
                <dd className="mt-1 font-heading text-2xl font-semibold text-primary-700">$50</dd>
              </div>
            </dl>
          </div>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-secondary-600">
            Copied positions can gain or lose value. Fees and execution prices can affect results.
          </p>
        </div>
        <Image
          src="/images/sections/copy-trading.webp"
          alt="Illustration of a strategy’s chart mirrored in a copy portfolio."
          width={1536}
          height={1024}
          sizes="(min-width: 1280px) 600px, (min-width: 1024px) 47vw, 100vw"
          className="w-full rounded-2xl border border-secondary-200 lg:col-start-1 lg:row-start-1"
        />
      </div>

      <div className="mt-12 border-t border-secondary-200 pt-8 sm:mt-16">
        <h3 className="text-2xl font-semibold tracking-tight text-secondary-900">See it in action</h3>
        <div className="mt-5 grid gap-5 md:grid-cols-3">
          {copyTradingVideos.map((item) => (
            <article key={item.video} className="overflow-hidden rounded-2xl border border-secondary-200 bg-white">
              <video
                src={item.video}
                aria-label={item.title}
                width={1184}
                height={1012}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="block h-auto w-full bg-secondary-900"
              >
                <a href={item.video}>Open the video</a>
              </video>
              <div className="p-5 sm:p-6">
                <h4 className="text-lg font-semibold text-secondary-900">{item.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-secondary-600">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Section>
  )
}
