"use client"

import Image from "next/image"
import { useState } from "react"
import { ArrowDownToLine, ArrowRight, ChartPie, Wallet } from "lucide-react"

import { cn } from "@/lib/utils"

const views = [
  {
    title: "Your portfolio",
    detail: "See how much of your balance is available as cash and how much is held in each asset.",
    image: "phone-portfolio",
    alt: "Bowline portfolio illustration on a phone, with Bitcoin and Ethereum holdings.",
    icon: ChartPie,
  },
  {
    title: "Add funds",
    detail: "Choose a deposit method and follow your deposit from submission to approval.",
    image: "account-funding",
    alt: "A blue payment card behind an illustrated $500 funding request.",
    icon: Wallet,
  },
  {
    title: "Track withdrawals",
    detail: "Request a withdrawal to a bank account or crypto wallet and check its status in your account.",
    image: "crypto-withdrawal",
    alt: "Illustrated receipt for a completed Bitcoin withdrawal.",
    icon: ArrowDownToLine,
  },
] as const

export function AccountTour() {
  const [active, setActive] = useState(0)
  const view = views[active]

  return (
    <section id="account-tour" aria-labelledby="tour-title" className="bg-white">
      <div className="container-px grid items-center gap-x-12 gap-y-6 py-14 sm:py-20 lg:grid-cols-[1.12fr_1fr] lg:grid-rows-[auto_auto] lg:gap-x-20">
        <h2 id="tour-title" className="text-4xl leading-[1.04] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl lg:col-start-2 lg:row-start-1 lg:self-end xl:text-6xl">
          Inside your<br /><span className="font-serif font-normal text-primary-600 italic">Bowline account.</span>
        </h2>
        <div id="tour-image" className="aspect-3/2 overflow-hidden rounded-2xl bg-secondary-50 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <Image
            src={`/images/sections/${view.image}.webp`}
            alt={view.alt}
            width={1536}
            height={1024}
            sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, 100vw"
            className="size-full object-cover"
          />
        </div>
        <div role="group" aria-label="Account walkthrough" className="divide-y divide-secondary-200 border-y border-secondary-200 lg:col-start-2 lg:row-start-2 lg:self-start">
          {views.map(({ title, detail, icon: Icon }, index) => {
            const selected = index === active
            return (
              <div key={title} className={cn("relative pl-4", selected && "bg-linear-to-r from-primary-50 to-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-primary-600")}>
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-controls="tour-image"
                  onClick={() => setActive(index)}
                  className="group flex min-h-14 w-full items-center gap-3 py-3 pr-3 text-left focus-visible:outline-2 focus-visible:outline-primary-600"
                >
                  <Icon aria-hidden className={cn("size-5 shrink-0", selected ? "text-primary-600" : "text-secondary-500")} />
                  <span className="flex-1 text-base font-semibold text-secondary-900 sm:text-lg">{title}</span>
                  <ArrowRight aria-hidden className={cn("size-4 transition-transform group-hover:translate-x-0.5", selected ? "text-primary-600" : "text-secondary-400")} />
                </button>
                {selected && <p className="-mt-1 max-w-md pb-4 pr-4 pl-8 text-sm leading-relaxed text-secondary-600">{detail}</p>}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
