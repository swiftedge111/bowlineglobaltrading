import Link from "next/link"
import { Mail, MapPin, Phone } from "lucide-react"

import { Logo } from "@/components/logo"
import { ScrollToTop } from "@/components/site/scroll-to-top"
import { company, footerLinks, legalLinks } from "@/lib/site"

export function Footer() {
  return (
    <footer className="bg-secondary-900 text-white">
      <div className="container-px py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-6 lg:gap-10">
          {/* Brand column */}
          <div className="col-span-2">
            <Logo invert />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-secondary-400">
              {company.description}
            </p>

            {(company.email || company.phoneHref || company.address) && (
              <ul className="mt-6 space-y-3 text-sm">
                {company.email && (
                  <li className="flex items-start gap-2.5 text-secondary-400">
                    <Mail className="mt-0.5 size-4 shrink-0 text-primary-400" />
                    <a
                      href={`mailto:${company.email}`}
                      className="transition-colors hover:text-primary-400"
                    >
                      {company.email}
                    </a>
                  </li>
                )}
                {company.phoneHref && (
                  <li className="flex items-start gap-2.5 text-secondary-400">
                    <Phone className="mt-0.5 size-4 shrink-0 text-primary-400" />
                    <a
                      href={company.phoneHref}
                      className="transition-colors hover:text-primary-400"
                    >
                      {company.phone}
                    </a>
                  </li>
                )}
                {company.address && (
                  <li className="flex items-start gap-2.5 text-secondary-400">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-primary-400" />
                    <span>{company.address}</span>
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* Link columns */}
          {footerLinks.map((column) => (
            <div key={column.title}>
              <h3 className="mb-4 text-sm font-semibold tracking-wider text-secondary-300 uppercase">
                {column.title}
              </h3>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-secondary-400 transition-colors hover:text-primary-400"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Risk disclosure */}
        <div id="risk-disclosure" className="mt-12 rounded-xl border border-secondary-800 bg-secondary-800/40 p-5">
          <h4 className="text-xs font-semibold tracking-wider text-secondary-300 uppercase">
            Risk disclosure
          </h4>
          <p className="mt-2 text-xs leading-relaxed text-secondary-400">
            Trading forex, cryptocurrencies, stocks and commodities carries a
            high level of risk and may not be suitable for every investor. Prices
            can move sharply against you and you may lose some or all of your
            invested capital. Past performance is not a reliable indicator of
            future results. Projected returns shown on this site are illustrative
            and are not guaranteed. Only trade with capital you can afford to
            lose, and seek independent financial advice if you are unsure.
          </p>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-secondary-800">
        <div className="container-px flex flex-col items-center justify-between gap-4 py-5 sm:flex-row">
          <p className="text-center text-sm text-secondary-500">
            &copy; {new Date().getFullYear()} {company.name}. All rights
            reserved.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {legalLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-secondary-500 transition-colors hover:text-primary-400"
              >
                {link.label}
              </Link>
            ))}
            <ScrollToTop />
          </div>
        </div>
      </div>
    </footer>
  )
}
