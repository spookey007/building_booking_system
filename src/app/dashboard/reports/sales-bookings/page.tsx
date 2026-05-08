import { db } from "@/lib/db";
import { formatUnitLabel } from "@/lib/unit-display";
import { SalesBookingsWorkspace, type SalesBookingsRow, type SalesBookingsSummary } from "./sales-bookings-workspace";

export const dynamic = "force-dynamic";

function money(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export default async function SalesBookingsReportPage() {
  const [soldUnits, bookedUnits, totalInstallments, paidInstallments, soldValueAgg, bookedValueAgg, bookings] =
    await Promise.all([
      db.unit.count({ where: { listingStatus: "SOLD" } }),
      db.unit.count({ where: { listingStatus: "BOOKED" } }),
      db.paymentInstallment.count(),
      db.paymentInstallment.count({ where: { status: "PAID" } }),
      db.unit.aggregate({
        where: { listingStatus: "SOLD" },
        _sum: { basePrice: true },
      }),
      db.unit.aggregate({
        where: { listingStatus: "BOOKED" },
        _sum: { basePrice: true },
      }),
      db.booking.findMany({
        where: {
          status: { notIn: ["CANCELLED", "TRANSFERRED", "SWITCHED"] },
          unit: { listingStatus: { in: ["BOOKED", "SOLD"] } },
        },
        include: {
          customer: { select: { fullName: true, cnic: true } },
          unit: {
            include: {
              project: { select: { code: true } },
              tower: { select: { code: true } },
            },
          },
          plan: {
            include: {
              schedules: { select: { status: true } },
            },
          },
        },
        orderBy: { bookingDate: "desc" },
      }),
    ]);

  const rows: SalesBookingsRow[] = bookings.map((b) => {
    const schedules = b.plan?.schedules ?? [];
    const total = schedules.length;
    const paid = schedules.filter((s) => s.status === "PAID").length;
    const pending = schedules.filter((s) => s.status === "PENDING" || s.status === "PARTIAL" || s.status === "OVERDUE").length;
    const u = b.unit;
    const label = formatUnitLabel(u.tower.code, u.unitNo, u.prefix);
    return {
      bookingId: b.id,
      bookingNo: b.bookingNo,
      bookingDate: b.bookingDate.toISOString().slice(0, 10),
      bookingStatus: b.status,
      unitStatus: u.listingStatus,
      projectCode: u.project.code,
      unitLabel: label,
      customerName: b.customer.fullName,
      customerCnic: b.customer.cnic ?? "—",
      planName: b.plan?.planName ?? null,
      totalInstallments: total,
      paidInstallments: paid,
      pendingInstallments: pending,
    };
  });

  const summary: SalesBookingsSummary = {
    soldUnits,
    bookedUnits,
    totalInstallments,
    paidInstallments,
    soldStockValueLabel: money(Number(soldValueAgg._sum.basePrice ?? 0)),
    bookedStockValueLabel: money(Number(bookedValueAgg._sum.basePrice ?? 0)),
  };

  return <SalesBookingsWorkspace rows={rows} summary={summary} />;
}
