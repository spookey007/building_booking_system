-- CreateEnum
CREATE TYPE "LiabilityStatus" AS ENUM ('OPEN', 'SETTLED');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'TRANSFERRED';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'SWITCHED';

-- AlterTable
ALTER TABLE "Unit" DROP COLUMN IF EXISTS "expectedLoan";

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "previousBookingId" TEXT,
ADD COLUMN "transferDate" TIMESTAMP(3),
ADD COLUMN "switchDate" TIMESTAMP(3);

UPDATE "Booking"
SET "switchDate" = "switchingDate"
WHERE "switchDate" IS NULL
  AND "switchingDate" IS NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "sourceBookingId" TEXT;

-- CreateTable
CREATE TABLE "CompanyLiability" (
    "id" TEXT NOT NULL,
    "sourceBookingId" TEXT NOT NULL,
    "transferBookingId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" VARCHAR(400) NOT NULL,
    "status" "LiabilityStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyLiability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_booking_previous" ON "Booking"("previousBookingId");

-- CreateIndex
CREATE INDEX "idx_payment_source_booking" ON "Payment"("sourceBookingId");

-- CreateIndex
CREATE INDEX "idx_liability_status_due" ON "CompanyLiability"("status", "dueDate");

-- CreateIndex
CREATE INDEX "idx_liability_source_booking" ON "CompanyLiability"("sourceBookingId");

-- CreateIndex
CREATE INDEX "idx_liability_transfer_booking" ON "CompanyLiability"("transferBookingId");

-- AddForeignKey
ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_previousBookingId_fkey"
FOREIGN KEY ("previousBookingId") REFERENCES "Booking"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_sourceBookingId_fkey"
FOREIGN KEY ("sourceBookingId") REFERENCES "Booking"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLiability"
ADD CONSTRAINT "CompanyLiability_sourceBookingId_fkey"
FOREIGN KEY ("sourceBookingId") REFERENCES "Booking"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLiability"
ADD CONSTRAINT "CompanyLiability_transferBookingId_fkey"
FOREIGN KEY ("transferBookingId") REFERENCES "Booking"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
