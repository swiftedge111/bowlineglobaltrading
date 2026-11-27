"use client"

import { ArrowUp } from "lucide-react"

/**
 * Isolated as a client component so the footer itself can stay on the server.
 */
export function ScrollToTop() {
  return (
    <button
      type="button"
      onClick={() => {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        window.scrollTo({ top: 0, behavior: reduceMotion ? "instant" : "smooth" })
      }}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/25 px-3 text-sm font-medium text-primary-100 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-200"
    >
      Back to top <ArrowUp aria-hidden className="size-4" />
    </button>
  )
}
