import type { Metadata } from "next"

import { company } from "@/lib/site"

export const shareImage = {
  url: "/og-image.jpg?v=2",
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: `White ${company.name} logo on a dark background`,
} as const

export const siteTitle = `${company.name} | ${company.tagline}`

function socialMetadata(
  title: string,
  description: string,
  path?: string,
  type: "website" | "article" = "website"
) {
  return {
    openGraph: {
      type,
      siteName: company.name,
      locale: "en_US",
      url: path,
      title,
      description,
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [shareImage],
    },
  } satisfies Pick<Metadata, "openGraph" | "twitter">
}

export const siteSocialMetadata = socialMetadata(siteTitle, company.description)

interface PageSeoOptions {
  /** Page title, without the site suffix — the root template appends that. */
  title: string
  description: string
  /** Canonical path when the page has a stable URL. */
  path?: string
  robots?: Metadata["robots"]
  type?: "website" | "article"
}

export function pageSeo({ title, description, path, robots, type }: PageSeoOptions): Metadata {
  return {
    title,
    description,
    ...(robots ? { robots } : {}),
    ...(path ? { alternates: { canonical: path } } : {}),
    ...socialMetadata(`${title} | ${company.name}`, description, path, type),
  }
}
