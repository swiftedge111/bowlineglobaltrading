import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PinReveal } from "@/components/pin/pin-reveal"
import { API_BASE_URL } from "@/lib/api/base-url"
import type { PinShare } from "@/lib/api/types"
import { pageSeo } from "@/lib/seo"
import { company } from "@/lib/site"

/**
 * The preview identifies the sender and the purpose of the link. The recipient
 * and PIN stay behind the reveal action.
 */
export const metadata: Metadata = pageSeo({
  title: "Your Withdrawal PIN",
  description: `Open this link to view your one-time withdrawal PIN from ${company.name}.`,
  robots: { index: false, follow: false, nocache: true },
  type: "article",
})

/**
 * Fetched with a plain `fetch` rather than the shared API client, which keeps an
 * access token in a module closure — correct in a browser, wrong on a server
 * where the module is shared across every visitor.
 *
 * This read never returns the PIN and never spends the link. Revealing is a
 * POST, made from the browser on an explicit tap.
 */
async function loadShare(token: string): Promise<PinShare | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/pin-links/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    )
    if (!response.ok) return null
    const body = (await response.json()) as { data?: { share?: PinShare } }
    return body.data?.share ?? null
  } catch {
    return null
  }
}

/** `params` is a promise in this version of Next — it must be awaited. */
export default async function PinLinkPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const share = await loadShare(token)

  if (!share) notFound()

  return <PinReveal token={token} initial={share} />
}
