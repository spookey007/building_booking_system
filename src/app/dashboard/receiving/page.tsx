import { db } from "@/lib/db";
import { ReceivingWorkspace } from "./receiving-workspace";

export const dynamic = "force-dynamic";

export default async function ReceivingPage() {
  const receivings = await db.receiving.findMany({
    take: 500,
    orderBy: { receivedDate: "desc" },
    include: {
      customer: { select: { fullName: true } },
      _count: { select: { allocations: true } },
    },
  });

  const liabilities = await db.companyLiability.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      sourceBooking: { select: { bookingNo: true } },
      transferBooking: { select: { bookingNo: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Receiving</h2>
        <p className="text-sm text-slate-500">
          Record receipts against payment schedules. Split one receiving across multiple installments and bookings.
        </p>
      </div>
      <ReceivingWorkspace
        initialRows={receivings.map((r) => ({
          id: r.id,
          receivingNo: r.receivingNo,
          receivedDate: r.receivedDate.toISOString().slice(0, 10),
          customerName: r.customer.fullName,
          mode: r.mode,
          totalAmount: r.totalAmount.toString(),
          allocationCount: r._count.allocations,
          voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
        }))}
        liabilities={liabilities.map((l) => ({
          id: l.id,
          bookingNo: l.sourceBooking.bookingNo,
          transferBookingNo: l.transferBooking?.bookingNo ?? null,
          liabilityType: l.liabilityType,
          amount: l.amount.toString(),
          reason: l.reason,
          status: l.status,
        }))}
      />
    </div>
  );
}
