import { createHash } from "node:crypto"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const filename = "user-country.mmdb"
const baseUrl = "https://github.com/sapics/ip-location-db/releases/download"
const databaseUrl = `${baseUrl}/latest/${filename}`
const checksumUrl = `${baseUrl}/checksum/${filename}.sha256`
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), "../data", filename)

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  return response
}

try {
  const [databaseResponse, checksumResponse] = await Promise.all([
    get(databaseUrl),
    get(checksumUrl),
  ])
  const [database, checksumText] = await Promise.all([
    databaseResponse.arrayBuffer(),
    checksumResponse.text(),
  ])
  const expected = checksumText.trim().split(/\s+/)[0]?.toLowerCase()
  const actual = createHash("sha256").update(Buffer.from(database)).digest("hex")

  if (!expected || actual !== expected) {
    throw new Error("IP country database checksum did not match")
  }

  await mkdir(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp`
  await writeFile(temporaryPath, Buffer.from(database))
  await rename(temporaryPath, outputPath)
  console.log("Updated offline IP country database.")
} catch (error) {
  console.warn(
    `Could not update the optional offline IP country database. Signup IPs will still be stored; IP country will be blank. ${error instanceof Error ? error.message : String(error)}`
  )
}
