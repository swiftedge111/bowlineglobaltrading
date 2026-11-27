-- Plan returns pay once per full 24 hours after a subscription starts, and
-- accrual catches up on any periods it missed. This column counts the periods
-- already paid.
ALTER TABLE "subscriptions" ADD COLUMN "accruedPeriods" INTEGER NOT NULL DEFAULT 0;

-- Backfill from the ledger. The old daily job wrote one PLAN_PAYOUT credit per
-- day it paid, tagged with the subscription's id.
UPDATE "subscriptions" AS s
SET "accruedPeriods" = (
  SELECT count(*)::int
  FROM "transactions" AS t
  WHERE t."category" = 'PLAN_PAYOUT'
    AND t."type" = 'CREDIT'
    AND t."metadata"->>'subscriptionId' = s."id"
);
