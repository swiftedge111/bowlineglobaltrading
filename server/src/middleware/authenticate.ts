import type { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"

import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from "../config/constants.js"
import { env } from "../config/env.js"
import { TokenExpiredError, UnauthenticatedError } from "../lib/errors.js"
import type { AccessTokenPayload } from "../modules/auth/token.service.js"

/**
 * Verifies the access token and populates `req.auth`.
 *
 * Accepts Bearer tokens and forwards the role claim to `requireRole`.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization

  if (!header?.startsWith("Bearer ")) {
    next(new UnauthenticatedError("Authorization header missing or malformed."))
    return
  }

  const token = header.slice("Bearer ".length).trim()
  if (!token) {
    next(new UnauthenticatedError("Authorization token missing."))
    return
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    }) as AccessTokenPayload

    req.auth = { userId: payload.sub, role: payload.role }
    next()
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(new TokenExpiredError())
      return
    }
    next(new UnauthenticatedError("Invalid authentication token."))
  }
}
