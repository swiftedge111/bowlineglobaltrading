import Image from "next/image"
import { ListFilter, ShieldCheck } from "lucide-react"

import { Section } from "@/components/site/section"

export function Features() {
  return (
    <Section id="why-us" aria-labelledby="features-title" className="bg-secondary-50">
      <h2 id="features-title" className="mb-8 text-4xl leading-[1.05] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl xl:text-6xl">
        Follow your <span className="font-serif font-normal text-primary-600 italic">money.</span>
      </h2>
      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <article className="grid overflow-hidden rounded-2xl border border-secondary-200 bg-white sm:grid-cols-[1fr_1.1fr]">
          <div className="self-center p-6 sm:p-8">
            <h3 className="text-2xl leading-tight font-semibold tracking-tight text-secondary-900">A receipt for your records</h3>
            <p className="mt-3 leading-relaxed text-secondary-600">
              Find the amount, date and account reference on your payment receipt. Print a copy or save it as a PDF.
            </p>
          </div>
          <Image
            src="/images/sections/crypto-withdrawal.webp"
            alt="An illustrated Bowline Bitcoin withdrawal receipt."
            width={1536}
            height={1024}
            sizes="(min-width: 1280px) 380px, (min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
            className="h-full min-h-0 w-full bg-primary-50 object-contain"
          />
        </article>
        <div className="divide-y divide-secondary-200 border-y border-secondary-200">
          <article className="flex gap-4 py-6">
            <ListFilter aria-hidden className="mt-1 size-6 shrink-0 text-primary-600" />
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">Find a transaction</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary-600">Filter your history by credit or debit, category and status to find a specific payment.</p>
            </div>
          </article>
          <article className="flex gap-4 py-6">
            <ShieldCheck aria-hidden className="mt-1 size-6 shrink-0 text-primary-600" />
            <div>
              <h3 className="text-lg font-semibold text-secondary-900">Authorize a withdrawal</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-secondary-600">Confirm each withdrawal request with the PIN issued by your account manager.</p>
            </div>
          </article>
        </div>
      </div>
    </Section>
  )
}
