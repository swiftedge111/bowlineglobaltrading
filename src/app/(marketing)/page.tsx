import type { Metadata } from "next"

import { siteSocialMetadata } from "@/lib/seo"
import { StructuredData } from "@/components/site/structured-data"
import { Hero } from "@/components/home/hero"
import { InstrumentDirectory } from "@/components/home/instrument-directory"
import { AccountTour } from "@/components/home/account-tour"
import { Markets } from "@/components/home/markets"
import { LiveMarkets } from "@/components/home/live-markets"
import { Features } from "@/components/home/features"
import { Platform } from "@/components/home/platform"
import { HowItWorks } from "@/components/home/how-it-works"
import { CopyTrading } from "@/components/home/copy-trading"
import { Plans } from "@/components/home/plans"
import { Testimonials } from "@/components/home/testimonials"
import { Faq } from "@/components/home/faq"
import { Cta } from "@/components/home/cta"

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...siteSocialMetadata.openGraph, url: "/" },
}

export default function Home() {
  return (
    <>
      <StructuredData />
      <Hero />
      <InstrumentDirectory />
      <AccountTour />
      <Markets />
      <LiveMarkets />
      <Features />
      <Platform />
      <HowItWorks />
      <CopyTrading />
      <Plans />
      <Testimonials />
      <Faq />
      <Cta />
    </>
  )
}
