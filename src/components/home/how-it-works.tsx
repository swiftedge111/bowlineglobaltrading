import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { Section } from "@/components/site/section"
import { Button } from "@/components/ui/button"
import { steps } from "@/lib/site"

export function HowItWorks() {
  return (
    <Section id="how-it-works" aria-labelledby="getting-started-title" className="bg-white">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          <h2 id="getting-started-title" className="text-4xl leading-[1.05] font-semibold tracking-[-0.055em] text-secondary-900 sm:text-5xl xl:text-6xl">
            Getting started <span className="inline-block font-serif font-normal text-primary-600 italic">with Bowline.</span>
          </h2>
          <p className="mt-4 max-w-lg leading-relaxed text-secondary-600">
            See how to open and fund your account, choose a plan, and track it from your dashboard.
          </p>
        </div>
        <Button asChild>
          <Link href="/signup">
            Open an account <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>

      <ol role="list" className="grid gap-6 rounded-2xl border border-secondary-200 bg-secondary-50 p-5 sm:p-8 md:grid-cols-4 lg:p-10">
        {steps.map((step, index) => (
          <li key={step.title} className="relative grid grid-cols-[auto_1fr] items-start gap-4 after:absolute after:top-5 after:-bottom-11 after:left-5 after:w-px after:bg-secondary-300 last:after:hidden md:block md:after:-right-11 md:after:bottom-auto md:after:h-px md:after:w-auto">
            <span aria-hidden className="relative z-10 grid size-10 place-items-center rounded-full border border-primary-200 bg-white font-heading text-sm font-semibold text-primary-700">
              {index + 1}
            </span>
            <div className="pt-0.5 md:pt-4">
              <h3 className="text-lg leading-snug font-semibold text-secondary-900">{step.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-secondary-600">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}
