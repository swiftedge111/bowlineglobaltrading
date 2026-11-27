-- Which withdrawal each PIN authorised. Additive and nullable: PINs used
-- before this stay unlinked.
ALTER TABLE "withdrawal_pins" ADD COLUMN "withdrawalId" TEXT;

CREATE UNIQUE INDEX "withdrawal_pins_withdrawalId_key" ON "withdrawal_pins"("withdrawalId");

ALTER TABLE "withdrawal_pins" ADD CONSTRAINT "withdrawal_pins_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
