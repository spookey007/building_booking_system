import { db } from "@/lib/db";
import { formatUnitLabel } from "@/lib/unit-display";
import { PaymentsWorkspace } from "./payments-workspace";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const payments = await db.payment.findMany({
    take: 500,
    orderBy: { paymentDate: "desc" },
    include: {
      booking: {
        include: {
          customer: { select: { fullName: true } },
          unit: {
            include: {
              tower: { select: { code: true } },
            },
          },
        },
      },
      sourceBooking: {
        select: {
          bookingNo: true,
        },
      },
      installment: { select: { installmentNo: true } },
    },
  });
  const openLiabilities = await db.companyLiability.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      sourceBooking: { select: { bookingNo: true } },
      transferBooking: { select: { bookingNo: true } },
    },
  });

  const initialRows = payments.map((payment) => ({
    id: payment.id,
    paymentDate: payment.paymentDate.toISOString().slice(0, 10),
    bookingNo: payment.booking.bookingNo,
    customerName: payment.booking.customer.fullName,
    unitLabel: formatUnitLabel(
      payment.booking.unit.tower.code,
      payment.booking.unit.unitNo,
      payment.booking.unit.prefix,
    ),
    mode: payment.mode,
    amount: payment.amount.toString(),
    referenceNo: payment.referenceNo?.trim() ? payment.referenceNo : "—",
    sourceBookingNo: payment.sourceBooking?.bookingNo ?? "—",
    installmentLabel: payment.installment ? `#${payment.installment.installmentNo}` : "—",
    voidedAt: payment.voidedAt ? payment.voidedAt.toISOString() : null,
    voidReason: payment.voidReason ?? null,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Payments</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Record receipts, tie them to installments, and void mistakes without losing audit history.
        </p>
      </div>
      <PaymentsWorkspace initialRows={initialRows} />
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Open Transfer Liabilities</h3>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Company payable amounts to previous owners after transfer completion.
        </p>
        <div className="mt-3 space-y-2">
          {openLiabilities.length === 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">No open liabilities.</p>
          ) : (
            openLiabilities.map((liability) => (
              <div
                key={liability.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm dark:border-amber-800 dark:bg-slate-900"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    [{liability.liabilityType}] Source: {liability.sourceBooking.bookingNo}
                    {liability.transferBooking ? ` -> Transfer: ${liability.transferBooking.bookingNo}` : ""}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{liability.reason}</p>
                </div>
                <p className="font-bold text-amber-900 dark:text-amber-200">{Number(liability.amount).toLocaleString("en-US")}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
