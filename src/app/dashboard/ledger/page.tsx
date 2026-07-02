import type { BookingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatUnitLabel } from "@/lib/unit-display";
import { LedgerWorkspace } from "./ledger-workspace";

export const dynamic = "force-dynamic";

const INACTIVE_BOOKING_STATUSES: BookingStatus[] = ["CANCELLED", "MERGED", "TRANSFERRED", "SWITCHED"];
const ACTIVE_BOOKING_FILTER = { status: { notIn: INACTIVE_BOOKING_STATUSES } };

export default async function LedgerPage() {
  const customers = await db.customer.findMany({
    where: { bookings: { some: ACTIVE_BOOKING_FILTER } },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, cnic: true },
  });

  const bookings = await db.booking.findMany({
    where: ACTIVE_BOOKING_FILTER,
    select: {
      id: true,
      bookingNo: true,
      customerId: true,
      unit: { include: { tower: { select: { code: true } } } },
    },
    orderBy: { bookingDate: "desc" },
  });

  const bookingsByCustomer: Record<string, { id: string; bookingNo: string; unitLabel: string }[]> = {};
  for (const b of bookings) {
    if (!bookingsByCustomer[b.customerId]) bookingsByCustomer[b.customerId] = [];
    bookingsByCustomer[b.customerId].push({
      id: b.id,
      bookingNo: b.bookingNo,
      unitLabel: formatUnitLabel(b.unit.tower.code, b.unit.unitNo, b.unit.prefix),
    });
  }

  return (
    <LedgerWorkspace
      customers={customers}
      bookingsByCustomer={bookingsByCustomer}
      portfolioSummary={{ customerCount: customers.length, bookingCount: bookings.length }}
    />
  );
}
