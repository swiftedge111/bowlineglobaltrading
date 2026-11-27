import { Router } from "express"
import { z } from "zod"

import { ValidationError } from "../../lib/errors.js"
import { ok } from "../../lib/http.js"
import { toE164 } from "../../lib/phone.js"
import { prisma } from "../../lib/prisma.js"
import { asyncHandler } from "../../middleware/async-handler.js"
import { validate } from "../../middleware/validate.js"
import { changePasswordSchema } from "../auth/auth.schema.js"
import { changePassword, toPublicUser } from "../auth/auth.service.js"

export const usersRouter: Router = Router()

/**
 * Numbers are checked with the same rules as signup and stored as E.164.
 * Neither can be removed: signup requires both, and support relies on them.
 * The phone is read against the account's country, so a local number works;
 * the contact number needs its international code.
 */
const updateProfileSchema = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  phone: z.string().trim().min(1, "Enter your phone number.").max(30).optional(),
  contactPhone: z
    .string()
    .trim()
    .min(1, "Enter your WhatsApp or Telegram number.")
    .max(30)
    .optional(),
})

usersRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
    })
    ok(res, { user: toPublicUser(user) })
  })
)

usersRouter.patch(
  "/me",
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateProfileSchema>
    const current = await prisma.user.findUniqueOrThrow({
      where: { id: req.auth!.userId },
      select: { country: true },
    })

    const issues: Array<{ path: string; message: string }> = []
    const phone = body.phone !== undefined ? toE164(body.phone, current.country ?? "") : undefined
    if (phone === null) {
      issues.push({
        path: "phone",
        message: current.country
          ? "Enter a valid phone number for your country."
          : "Enter a valid phone number, including the country code.",
      })
    }
    const contactPhone =
      body.contactPhone !== undefined ? toE164(body.contactPhone, "") : undefined
    if (contactPhone === null) {
      issues.push({
        path: "contactPhone",
        message: "Enter a valid number including the country code, e.g. +44 7911 123456.",
      })
    }
    if (issues.length > 0) {
      throw new ValidationError("Check the highlighted fields.", issues)
    }

    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
        ...(phone ? { phone } : {}),
        ...(contactPhone ? { contactPhone } : {}),
      },
    })

    ok(res, { user: toPublicUser(user) })
  })
)

usersRouter.post(
  "/me/change-password",
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    await changePassword(req.auth!.userId, req.body)
    ok(res, {
      message: "Password updated. You have been signed out on all devices.",
    })
  })
)
