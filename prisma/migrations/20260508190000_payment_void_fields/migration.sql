-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidReason" VARCHAR(500);

-- CreateIndex
CREATE INDEX "idx_payment_voided" ON "Payment"("voidedAt");
