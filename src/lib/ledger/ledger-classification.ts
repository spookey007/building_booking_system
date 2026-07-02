import type { LedgerType } from "@prisma/client";

export const LEDGER_TYPE_LABELS: Record<LedgerType, string> = {
  OFFICIAL: "Official",
  UNOFFICIAL: "Unofficial",
  UTILITY: "Utility",
  PARKING: "Parking",
};

export const ALL_LEDGER_TYPES: LedgerType[] = ["OFFICIAL", "UNOFFICIAL", "UTILITY", "PARKING"];

/** Default ledger type when user does not specify one on a receiving allocation. */
export function defaultLedgerTypeForAllocation(): LedgerType {
  return "OFFICIAL";
}

/**
 * Booking add-on fields map to ledger buckets for statement filtering.
 * Official = core contract (installments + documentation + tax).
 */
export function bookingAddonLedgerBuckets(booking: {
  addonParking?: number | null;
  addonUtility?: number | null;
  addonDocumentation?: number | null;
  addonTax?: number | null;
  addonPenalty?: number | null;
  bookingTransferFee?: number | null;
}) {
  return {
    parking: Number(booking.addonParking ?? 0),
    utility: Number(booking.addonUtility ?? 0),
    officialAddons: Number(booking.addonDocumentation ?? 0) + Number(booking.addonTax ?? 0),
    unofficial:
      Number(booking.addonPenalty ?? 0) + Number(booking.bookingTransferFee ?? 0),
  };
}

export function paymentMatchesLedgerFilter(
  ledgerType: LedgerType,
  paymentLedgerType: LedgerType,
): boolean {
  return paymentLedgerType === ledgerType;
}
