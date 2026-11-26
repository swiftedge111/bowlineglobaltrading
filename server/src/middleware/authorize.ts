import { Role } from "@prisma/client"
import type { NextFunction, Request, Response } from "express"

import { ForbiddenError, UnauthenticatedError } from "../lib/errors.js"

/** Role gate. Mount after authenticate. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new UnauthenticatedError())
      return
    }

    if (!roles.includes(req.auth.role)) {
      next(new ForbiddenError())
      return
    }

    next()
  }
}

export const requireAdmin = requireRole(Role.ADMIN)
