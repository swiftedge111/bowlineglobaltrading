import type { NextFunction, Request, RequestHandler, Response } from "express"
import type { ZodType } from "zod"

import { ValidationError, type ErrorDetail } from "../lib/errors.js"

interface Schemas {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

/** Replace the selected request fields with the parsed values. */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const details: ErrorDetail[] = []

    for (const key of ["body", "query", "params"] as const) {
      const schema = schemas[key]
      if (!schema) continue

      const result = schema.safeParse(req[key])

      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({
            path: [key, ...issue.path.map(String)].join("."),
            message: issue.message,
          })
        }
        continue
      }

      if (key === "query") {
        // Express 5 exposes `req.query` via a getter, so it cannot be assigned.
        Object.defineProperty(req, "query", {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        })
      } else {
        req[key] = result.data as never
      }
    }

    if (details.length > 0) {
      next(new ValidationError("The request contains invalid data.", details))
      return
    }

    next()
  }
}
