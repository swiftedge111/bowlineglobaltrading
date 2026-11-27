import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { API_BASE_URL } from "@/lib/api/base-url"
import { company } from "@/lib/site"

export const alt = `Payment receipt with the ${company.name} logo`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

/**
 * What a forwarded receipt link looks like in a chat before anyone taps it.
 *
 * Deliberately shows the reference and nothing else. A link preview is rendered
 * by WhatsApp's servers and then sits in the conversation for everyone in it —
 * including anyone the message is later forwarded to — so the amount and the
 * client's name stay behind the tap, where the page already requires an
 * unguessable token. What the preview needs to convey is only "this is a
 * receipt from Bowline Global Trading", which is exactly what was missing when it
 * fell back to the generic site card.
 */
async function loadReference(token: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/receipts/${encodeURIComponent(token)}`,
      { cache: "no-store" }
    )
    if (!response.ok) return null
    const body = (await response.json()) as {
      data?: { receipt?: { reference?: string } }
    }
    return body.data?.receipt?.reference ?? null
  } catch {
    return null
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const [reference, logo] = await Promise.all([
    loadReference(token),
    readFile(join(process.cwd(), "public/images/logo-options/01-bowline-knot.png")),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#fdfdfd",
          color: "#001652",
          fontFamily: "sans-serif",
        }}
      >
        {/* ImageResponse renders this embedded PNG directly. */}
        <img
          src={`data:image/png;base64,${logo.toString("base64")}`}
          alt={company.name}
          width={385}
          height={164}
        />

        <div
          style={{
            marginTop: 12,
            fontSize: 22,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#0035e1",
            fontWeight: 700,
          }}
        >
          Payment receipt
        </div>

        <div
          style={{
            marginTop: 14,
            fontSize: 78,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          {reference ?? "Receipt unavailable"}
        </div>

        {reference && (
          <div style={{ marginTop: 26, fontSize: 28, color: "#374e60" }}>
            View the receipt for this completed transaction.
          </div>
        )}
      </div>
    ),
    size
  )
}
