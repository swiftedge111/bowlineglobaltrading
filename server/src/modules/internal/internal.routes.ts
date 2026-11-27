import { Router } from "express"

import { runPlanAccrual } from "../../jobs/index.js"
import { ok } from "../../lib/http.js"
import { asyncHandler } from "../../middleware/async-handler.js"
import { requireCronSecret } from "../../middleware/require-cron-secret.js"

/**
 * Endpoints for an external scheduler, not for people.
 *
 * A host that idles its instances (Render's free tier, for example) never runs
 * the in-process schedule while asleep. A request here wakes the instance and
 * runs the job. See `prisma/supabase-cron.sql` for the pg_cron setup that
 * calls it.
 */
export const internalRouter: Router = Router()

internalRouter.use(requireCronSecret)

internalRouter.post(
  "/jobs/accrue-plan-returns",
  asyncHandler(async (_req, res) => {
    ok(res, await runPlanAccrual("endpoint"))
  })
)
