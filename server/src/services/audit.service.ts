import type { Prisma } from "@prisma/client"

import { logger } from "../lib/logger.js"
import { prisma } from "../lib/prisma.js"

/** Append-only record of privileged actions. */
export interface AuditInput {
  actorId: string | null
  action: string
  targetType: string
  targetId?: string | undefined
  before?: Prisma.InputJsonValue | undefined
  after?: Prisma.InputJsonValue | undefined
  ip?: string | undefined
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        ...(input.before !== undefined ? { before: input.before } : {}),
        ...(input.after !== undefined ? { after: input.after } : {}),
        ip: input.ip ?? null,
      },
    })
  } catch (error) {
    // Never let audit logging break the operation it is recording — but do
    // make the failure loud.
    logger.error({ err: error, action: input.action }, "Audit write failed")
  }
}
