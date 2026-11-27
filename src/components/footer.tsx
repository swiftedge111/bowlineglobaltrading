import Link from "next/link"
import { Info, Mail, MapPin, Phone } from "lucide-react"

import { Logo } from "@/components/logo"
import { ScrollToTop } from "@/components/site/scroll-to-top"
import { company, footerLinks } from "@/lib/site"

export function Footer() {
  return (
    <footer id="footer" className="border-t border-primary-800 bg-primary-950 text-white">
      <div className="container-px">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 py-6 sm:py-8">
          <Link
            href="/"
            aria-label={`${company.name} home`}
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-200"
          >
            <Logo invert className="w-36 sm:w-48" />
          </Link>
          <ScrollToTop />
        </div>

        <div className="grid gap-7 py-7 sm:py-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)] lg:gap-10">
          <div>
            <p className="max-w-xs text-sm leading-relaxed text-secondary-300">
              Follow the markets and manage your portfolio from one Bowline account.
            </p>

            {(company.email || company.phoneHref || company.address) && (
              <address className="mt-4 text-sm text-secondary-300 not-italic">
                <ul role="list" className="space-y-2.5">
                  {company.email && (
                    <li className="flex items-start gap-2.5">
                      <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-300" />
                      <a href={`mailto:${company.email}`} className="wrap-anywhere hover:text-white hover:underline">
                        {company.email}
                      </a>
                    </li>
                  )}
                  {company.phoneHref && (
                    <li className="flex items-start gap-2.5">
                      <Phone aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-300" />
                      <a href={company.phoneHref} className="hover:text-white hover:underline">
                        {company.phone}
                      </a>
                    </li>
                  )}
                  {company.address && (
                    <li className="flex items-start gap-2.5">
                      <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-300" />
                      <span className="wrap-anywhere">{company.address}</span>
                    </li>
                  )}
                </ul>
              </address>
            )}
          </div>

          <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-4">
            {footerLinks.map((column) => (
              <div key={column.title}>
                <h2 className="mb-2 text-sm font-semibold text-white">{column.title}</h2>
                <ul role="list" className="space-y-0.5">
                  {column.links.map(({ href, label }) => (
                    <li key={label}>
                      <Link
                        href={href}
                        className="inline-flex min-h-8 items-center rounded-sm py-1 text-sm leading-snug text-secondary-300 underline-offset-4 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <section
          id="risk-disclosure"
          aria-labelledby="footer-risk-title"
          className="grid gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-4 sm:gap-3 sm:px-5 lg:grid-cols-[auto_1fr] lg:gap-7"
        >
          <h2 id="footer-risk-title" className="flex items-center gap-2 self-start text-sm font-semibold text-primary-100">
            <Info aria-hidden className="size-4 shrink-0 text-primary-300" /> Risk disclosure
          </h2>
          <p className="max-w-5xl text-xs leading-relaxed text-secondary-300">
            Trading forex, cryptocurrencies, stocks and commodities carries a
            high level of risk and may not be suitable for every investor. Prices
            can move sharply against you and you may lose some or all of your
            invested capital. Past performance is not a reliable indicator of
            future results. Projected returns shown on this site are illustrative
            and are not guaranteed. Only trade with capital you can afford to
            lose, and seek independent financial advice if you are unsure.
          </p>
        </section>

        <p className="mt-6 border-t border-white/15 py-5 text-xs text-secondary-300">
          &copy; {new Date().getFullYear()} {company.name}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
