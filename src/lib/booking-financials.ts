/** Shared booking financials: payable vs collected vs remaining (works with or without payment plans). */

export type BookingFinancials = {
  payable: number;
  paid: number;
  remaining: number;
  recoveryPct: number;
};

export type BookingFinancialsInput = {
  payableCost?: unknown;
  grossTotal?: unknown;
  payments?: { amount: unknown; voidedAt?: Date | null }[];
};

export function computeBookingFinancials(booking: BookingFinancialsInput): BookingFinancials {
  const payable = Number(booking.payableCost ?? booking.grossTotal ?? 0);
  const paid = (booking.payments ?? [])
    .filter((p) => !p.voidedAt)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const remaining = Math.max(0, payable - paid);
  const recoveryPct = payable > 0 ? Math.min(100, Math.round((paid / payable) * 100)) : paid > 0 ? 100 : 0;
  return { payable, paid, remaining, recoveryPct };
}

export function sumBookingFinancials(rows: BookingFinancials[]) {
  return rows.reduce(
    (acc, row) => ({
      payable: acc.payable + row.payable,
      paid: acc.paid + row.paid,
      remaining: acc.remaining + row.remaining,
    }),
    { payable: 0, paid: 0, remaining: 0 },
  );
}

export function portfolioRecoveryPct(totals: { payable: number; paid: number }) {
  if (totals.payable <= 0) return 0;
  return Math.min(100, Math.round((totals.paid / totals.payable) * 100));
}

/** Active bookings included in recovery / outstanding reports. */
export const ACTIVE_BOOKING_STATUSES = ["DRAFT", "CONFIRMED", "COMPLETED"] as const;
