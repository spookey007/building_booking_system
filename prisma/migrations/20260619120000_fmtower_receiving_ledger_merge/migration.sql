-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('OFFICIAL', 'UNOFFICIAL', 'UTILITY', 'PARKING');

-- CreateEnum
CREATE TYPE "LiabilityType" AS ENUM ('TRANSFER', 'CANCELLATION');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'MERGED';
ALTER TYPE "BookingMode" ADD VALUE 'MERGE';
ALTER TYPE "DocumentOwnerType" ADD VALUE 'RECEIVING';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "mergedIntoBookingId" TEXT;

-- AlterTable
ALTER TABLE "CompanyLiability" ADD COLUMN "liabilityType" "LiabilityType" NOT NULL DEFAULT 'TRANSFER';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "receivingId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "ledgerType" "LedgerType" NOT NULL DEFAULT 'OFFICIAL';

-- CreateTable
CREATE TABLE "Receiving" (
    "id" TEXT NOT NULL,
    "receivingNo" VARCHAR(64) NOT NULL,
    "customerId" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "receivedBy" VARCHAR(200),
    "chequeNo" VARCHAR(64),
    "chequeBank" VARCHAR(120),
    "chequeBranch" VARCHAR(120),
    "chequeDrawer" VARCHAR(200),
    "chequeDate" TIMESTAMP(3),
    "chequeStatus" VARCHAR(32),
    "onlineReceivedFrom" VARCHAR(200),
    "onlineReference" VARCHAR(120),
    "notes" VARCHAR(1000),
    "voidedAt" TIMESTAMP(3),
    "voidReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receiving_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivingAllocation" (
    "id" TEXT NOT NULL,
    "receivingId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "installmentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "ledgerType" "LedgerType" NOT NULL DEFAULT 'OFFICIAL',

    CONSTRAINT "ReceivingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingMerge" (
    "id" TEXT NOT NULL,
    "targetBookingId" TEXT NOT NULL,
    "sourceBookingId" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL,
    "mergedByUserId" TEXT NOT NULL,
    "notes" VARCHAR(1000),

    CONSTRAINT "BookingMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receiving_receivingNo_key" ON "Receiving"("receivingNo");
CREATE INDEX "idx_receiving_customer_date" ON "Receiving"("customerId", "receivedDate");
CREATE INDEX "idx_receiving_mode_date" ON "Receiving"("mode", "receivedDate");
CREATE INDEX "idx_receiving_voided" ON "Receiving"("voidedAt");

CREATE INDEX "idx_allocation_receiving" ON "ReceivingAllocation"("receivingId");
CREATE INDEX "idx_allocation_booking" ON "ReceivingAllocation"("bookingId");
CREATE INDEX "idx_allocation_ledger" ON "ReceivingAllocation"("ledgerType");

CREATE UNIQUE INDEX "BookingMerge_sourceBookingId_key" ON "BookingMerge"("sourceBookingId");
CREATE INDEX "idx_merge_target" ON "BookingMerge"("targetBookingId");

CREATE INDEX "idx_payment_receiving" ON "Payment"("receivingId");
CREATE INDEX "idx_payment_ledger_date" ON "Payment"("ledgerType", "paymentDate");
CREATE INDEX "idx_liability_type_status" ON "CompanyLiability"("liabilityType", "status");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_mergedIntoBookingId_fkey" FOREIGN KEY ("mergedIntoBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "Receiving"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Receiving" ADD CONSTRAINT "Receiving_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReceivingAllocation" ADD CONSTRAINT "ReceivingAllocation_receivingId_fkey" FOREIGN KEY ("receivingId") REFERENCES "Receiving"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceivingAllocation" ADD CONSTRAINT "ReceivingAllocation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivingAllocation" ADD CONSTRAINT "ReceivingAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "PaymentInstallment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingMerge" ADD CONSTRAINT "BookingMerge_targetBookingId_fkey" FOREIGN KEY ("targetBookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingMerge" ADD CONSTRAINT "BookingMerge_sourceBookingId_fkey" FOREIGN KEY ("sourceBookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PaymentPlan max installments
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_totalInstallments_max" CHECK ("totalInstallments" >= 1 AND "totalInstallments" <= 60);
