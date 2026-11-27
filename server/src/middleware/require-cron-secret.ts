import { createHash, timingSafeEqual } from "node:crypto"

import type { RequestHandler } from "express"

import { env } from "../config/env.js"
import { NotFoundError, UnauthenticatedError } from "../lib/errors.js"

const digest = (value: string): Buffer => createHash("sha256").update(value).digest()

/**
 * Guards the internal job endpoints, which an external scheduler such as
 * Supabase pg_cron calls with `Authorization: Bearer <CRON_SECRET>`.
 *
 * Without CRON_SECRET the endpoints don't exist (404), so a deployment that
 * never configured a scheduler exposes nothing. Both values are hashed before
 * comparing, so the comparison takes the same time whatever the secret's
 * length.
 */
export const requireCronSecret: RequestHandler = (req, _res, next) => {
  if (!env.CRON_SECRET) {
    next(new NotFoundError("Route"))
    return
  }

  const header = req.get("authorization") ?? ""
  const presented = header.startsWith("Bearer ") ? header.slice(7) : ""

  if (!presented || !timingSafeEqual(digest(presented), digest(env.CRON_SECRET))) {
    next(new UnauthenticatedError("Invalid job credentials."))
    return
  }

  next()
}
