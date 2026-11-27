-- Each subscription keeps the rate it started at. Until now payouts read the
-- plan's current rate, so editing a plan repriced every running subscription.
-- Existing rows take their plan's rate today: exactly what they are paid now.
ALTER TABLE "subscriptions" ADD COLUMN "dailyReturnBps" INTEGER;

UPDATE "subscriptions" AS s
SET "dailyReturnBps" = p."dailyReturnBps"
FROM "plans" AS p
WHERE p."id" = s."planId";

ALTER TABLE "subscriptions" ALTER COLUMN "dailyReturnBps" SET NOT NULL;
