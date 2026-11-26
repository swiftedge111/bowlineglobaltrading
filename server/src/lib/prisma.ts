import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

import { env, isProduction } from "../config/env.js"

/**
 * Prisma 7 connects through a driver adapter rather than a schema-level URL.
 *
 * `DATABASE_URL` can be a direct or pooled connection. Migrations prefer
 * `DIRECT_URL` when it is set (see prisma.config.ts).
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

const createClient = () =>
  new PrismaClient({
    adapter,
    log: isProduction ? ["warn", "error"] : ["warn", "error"],
  })

// tsx watch reloads this module on every change; without the global cache each
// reload would open a fresh pool and eventually exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (!isProduction) {
  globalForPrisma.prisma = prisma
}

/** Checks database connectivity for GET /health. */
export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}
