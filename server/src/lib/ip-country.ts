import { isIP } from "node:net"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import maxmind, { type CountryResponse } from "maxmind"

import { logger } from "./logger.js"

const databasePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/user-country.mmdb"
)

const database = maxmind.open<CountryResponse>(databasePath).catch((error: unknown) => {
  logger.warn({ err: error }, "Offline IP country database could not be loaded")
  return null
})

/** Resolves an ISO-2 country locally, without sending a visitor's IP away. */
export async function countryForIp(ip: string | undefined): Promise<string | null> {
  if (!ip) return null

  const normalizedIp = ip.replace(/^::ffff:/i, "")
  if (isIP(normalizedIp) === 0) return null

  try {
    const reader = await database
    const country = reader?.get(normalizedIp)?.country?.iso_code?.toUpperCase()
    return country && /^[A-Z]{2}$/.test(country) ? country : null
  } catch {
    return null
  }
}
