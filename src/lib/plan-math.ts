import type { Plan } from "@/lib/api/types"

/**
 * What a principal earns on a plan, for previews only.
 *
 * Mirrors the server's arithmetic: each period pays the principal times the
 * daily rate, rounded to the cent, and the term pays `durationDays` periods.
 * Works in whole cents so the preview and the ledger agree to the penny. The
 * server's own figures are what actually gets paid.
 */
export function projectPlan(
  plan: Pick<Plan, "dailyReturnPercent" | "durationDays">,
  amount: number
) {
  const principalCents = Math.max(0, Math.round(amount * 100))
  const bps = Math.round(Number(plan.dailyReturnPercent) * 100)
  const dailyCents = Math.round((principalCents * bps) / 10_000)
  const returnsCents = dailyCents * plan.durationDays

  const money = (cents: number) => (cents / 100).toFixed(2)

  return {
    daily: money(dailyCents),
    returns: money(returnsCents),
    atMaturity: money(principalCents + returnsCents),
    /** Simple, not compounded: returns are paid out, not reinvested. */
    termPercent: ((bps * plan.durationDays) / 100).toFixed(2),
  }
}
