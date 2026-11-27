import cron, { type ScheduledTask } from "node-cron"

import { logger } from "../lib/logger.js"
import { accruePlanReturns } from "../modules/plans/plans.service.js"

/**
 * In-process schedule.
 *
 * Nothing here has to run on time to be correct. Accrual pays every period it
 * finds owed, however late it runs, so a missed run (the instance was asleep,
 * deploying or down) only delays a payout and never loses one. The same job is
 * also triggered from outside through `POST /internal/jobs/accrue-plan-returns`,
 * which wakes an instance that has been idled.
 *
 * PIN expiry no longer has a job. Expired PINs are rejected when used, and the
 * stored status is corrected whenever an admin reads or changes PINs.
 */

const tasks: ScheduledTask[] = []

let accrualInFlight: Promise<unknown> | null = null

/**
 * Runs accrual unless a run is already in progress in this process. Overlap
 * would be safe anyway, because each subscription is claimed with a
 * compare-and-swap, but there is no reason to do the work twice.
 */
export function runPlanAccrual(trigger: string): Promise<unknown> {
  accrualInFlight ??= accruePlanReturns()
    .then((result) => {
      logger.info({ ...result, trigger }, "Accrued plan returns")
      return result
    })
    .finally(() => {
      accrualInFlight = null
    })

  return accrualInFlight
}

function schedule(name: string, expression: string, run: () => Promise<unknown>) {
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
  // Hourly, so a payout lands within an hour of being earned.
  schedule("accrue-plan-returns", "5 * * * *", () => runPlanAccrual("schedule"))

  // And once at startup, which catches up on anything missed while this
  // instance was down or asleep.
  void runPlanAccrual("startup").catch((error: unknown) => {
    logger.error({ err: error, job: "accrue-plan-returns" }, "Startup accrual failed")
  })
}

export function stopJobs(): void {
  for (const task of tasks) {
    void task.stop()
  }
  tasks.length = 0
}
