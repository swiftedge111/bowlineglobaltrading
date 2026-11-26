import { Router } from "express"
import { z } from "zod"

import { env } from "../../config/env.js"
import { created, noContent, ok } from "../../lib/http.js"
import { serialize } from "../../lib/money.js"
import { asyncHandler } from "../../middleware/async-handler.js"
import { pinLimiter } from "../../middleware/rate-limit.js"
import { validate } from "../../middleware/validate.js"
import { createWithdrawalSchema } from "./withdrawals.schema.js"
import * as service from "./withdrawals.service.js"

export const withdrawalsRouter: Router = Router()

withdrawalsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const requests = await service.listForUser(req.auth!.userId)
    ok(res, {
      withdrawals: requests.map((request) => ({
        id: request.id,
        amount: serialize(request.amount),
        fee: serialize(request.feeAmount),
        method: request.method,
        status: request.status,
        destination: request.destination,
        reviewNote: request.reviewNote,
        createdAt: request.createdAt,
      })),
      /** The client uses the same fee and minimum the server enforces. */
      limits: {
        feePercent: env.WITHDRAWAL_FEE_PERCENT.toFixed(2),
        minimum: env.MIN_WITHDRAWAL_USD.toFixed(2),
      },
    })
  })
)

withdrawalsRouter.post(
  "/",
  // Wrong PINs are throttled here, not just at a separate verify endpoint.
  pinLimiter,
  validate({ body: createWithdrawalSchema }),
  asyncHandler(async (req, res) => {
    const request = await service.createWithdrawal(req.auth!.userId, req.body)
    created(res, {
      withdrawal: {
        id: request.id,
        amount: serialize(request.amount),
        fee: serialize(request.feeAmount),
        method: request.method,
        status: request.status,
        createdAt: request.createdAt,
      },
    })
  })
)

withdrawalsRouter.post(
  "/:id/cancel",
  validate({ params: z.object({ id: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    await service.cancelWithdrawal(req.auth!.userId, req.params.id as string)
    noContent(res)
  })
)
