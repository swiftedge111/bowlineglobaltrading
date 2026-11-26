import cron, { type ScheduledTask } from "node-cron"

import { logger } from "../lib/logger.js"
import { accrueDailyReturns } from "../modules/plans/plans.service.js"
import { expireStalePins } from "../modules/pins/pins.service.js"

const tasks: ScheduledTask[] = []

function schedule(name: string, expression: string, run: () => Promise<void>) {
  const task = cron.schedule(
    expression,
    () => {
      void run().catch((error: unknown) => {
        logger.error({ err: error, job: name }, "Scheduled job failed")
      })
    },
    { timezone: "UTC" }
  )
  tasks.push(task)
  logger.info({ job: name, expression }, "Scheduled job registered")
}

export function startJobs(): void {
  // Hourly: mark expired PINs. Expiry is already checked at verification time,
  // so this is only to keep the table tidy for the admin view.
  schedule("expire-pins", "0 * * * *", async () => {
    const count = await expireStalePins()
    if (count > 0) logger.info({ count }, "Expired stale withdrawal PINs")
  })

  // Daily at 00:05 UTC: accrue plan returns. Idempotent per UTC day.
  schedule("accrue-plan-returns", "5 0 * * *", async () => {
    const result = await accrueDailyReturns()
    logger.info(result, "Accrued daily plan returns")
  })
}

export function stopJobs(): void {
  for (const task of tasks) {
    void task.stop()
  }
  tasks.length = 0
}
