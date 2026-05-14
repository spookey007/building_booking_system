-- Booking office add-ons (parking, utilities, documentation, tax, penalty, transfer-to-new-party fee)
ALTER TABLE "Booking" ADD COLUMN "addonParking" DECIMAL(14,2);
ALTER TABLE "Booking" ADD COLUMN "addonUtility" DECIMAL(14,2);
ALTER TABLE "Booking" ADD COLUMN "addonDocumentation" DECIMAL(14,2);
ALTER TABLE "Booking" ADD COLUMN "addonTax" DECIMAL(14,2);
ALTER TABLE "Booking" ADD COLUMN "addonPenalty" DECIMAL(14,2);
ALTER TABLE "Booking" ADD COLUMN "bookingTransferFee" DECIMAL(14,2);
