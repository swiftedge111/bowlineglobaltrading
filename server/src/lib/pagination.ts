import { z } from "zod"

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/constants.js"

/** Shared pagination limits for list endpoints. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
})

export type Pagination = z.infer<typeof paginationSchema>

export function toSkipTake(pagination: Pagination) {
  return {
    skip: (pagination.page - 1) * pagination.limit,
    take: pagination.limit,
  }
}
