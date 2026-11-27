import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Section } from "@/components/site/section"

export function Cta() {
  return (
    <Section id="get-started" aria-labelledby="get-started-title" className="bg-white pt-0 sm:pt-0 lg:pt-0">
      <div className="relative isolate grid items-center gap-7 overflow-hidden rounded-3xl bg-linear-to-br from-primary-800 via-secondary-900 to-primary-950 p-5 text-white sm:gap-9 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12 xl:p-14">
        <Image
          src="/brand/bowline-mark-reversed.svg"
          alt=""
          width={512}
          height={512}
          unoptimized
          className="pointer-events-none absolute -bottom-28 -left-16 -z-10 h-auto w-72 max-w-none opacity-10 sm:-bottom-40 sm:w-112 lg:-bottom-48 lg:left-1/5 lg:w-144"
        />

        <h2 id="get-started-title" className="text-4xl leading-[1.03] font-semibold tracking-[-0.055em] sm:text-6xl xl:text-7xl">
          Your <span className="font-serif font-normal text-primary-200 italic lg:block">next move.</span>
        </h2>

        <nav aria-label="Get started with Bowline" className="grid gap-3">
          <Link
            href="/signup"
            className="group grid min-h-20 grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-white bg-white p-4 text-secondary-900 transition-colors hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200 sm:px-5"
          >
            <span>
              <span className="block font-heading text-base font-semibold sm:text-lg">Open your account</span>
              <span className="mt-1 block text-sm leading-snug text-secondary-600">Create your Bowline login and access your dashboard.</span>
            </span>
            <span className="grid size-10 place-items-center rounded-full bg-primary-100 text-primary-700 sm:size-11">
              <ArrowRight aria-hidden className="size-5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href="#live-markets"
            className="group grid min-h-20 grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-white/25 bg-white/10 p-4 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200 sm:px-5"
          >
            <span>
              <span className="block font-heading text-base font-semibold sm:text-lg">Explore the markets</span>
              <span className="mt-1 block text-sm leading-snug text-primary-100">Browse forex, crypto, stocks and commodities.</span>
            </span>
            <span className="grid size-10 place-items-center rounded-full border border-white/25 text-primary-200 sm:size-11">
              <ArrowRight aria-hidden className="size-5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" />
            </span>
          </Link>
        </nav>
      </div>
    </Section>
  )
}
