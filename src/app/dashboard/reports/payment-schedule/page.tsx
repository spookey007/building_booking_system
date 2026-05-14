import { db } from "@/lib/db";
import { formatUnitLabel } from "@/lib/unit-display";
import { effectiveInstallmentStatus } from "@/lib/reports/installment-effective-status";
import { dueDateBounds } from "@/lib/reports/installment-report-filters";
import type { InstallmentScheduleRow } from "@/lib/reports/installment-schedule-row";
import { PaymentScheduleReportsWorkspace } from "./payment-schedule-reports-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Installment schedule · Reports · FM Towers",
};

export default async function PaymentScheduleReportPage() {
  const raw = await db.paymentInstallment.findMany({
    where: {
      paymentPlan: {
        booking: {
          status: { notIn: ["CANCELLED", "TRANSFERRED", "SWITCHED"] },
        },
      },
    },
    include: {
      payments: { where: { voidedAt: null }, select: { amount: true } },
      paymentPlan: {
        select: {
          planName: true,
          booking: {
            select: {
              id: true,
              bookingNo: true,
              status: true,
              customer: { select: { fullName: true, cnic: true } },
              unit: {
                select: {
                  unitNo: true,
                  prefix: true,
                  listingStatus: true,
                  tower: { select: { code: true } },
                  project: { select: { code: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { installmentNo: "asc" }],
  });

  const rows: InstallmentScheduleRow[] = raw.map((inst) => {
    const b = inst.paymentPlan.booking;
    const u = b.unit;
    const due = Number(inst.dueAmount);
    const paid = inst.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Math.max(0, due - paid);
    const status = effectiveInstallmentStatus(inst.status, inst.dueDate, balance);
    return {
      installmentId: inst.id,
      bookingId: b.id,
      bookingNo: b.bookingNo,
      bookingStatus: b.status,
      unitStatus: u.listingStatus,
      projectCode: u.project.code,
      unitLabel: formatUnitLabel(u.tower.code, u.unitNo, u.prefix),
      customerName: b.customer.fullName,
      customerCnic: b.customer.cnic ?? "",
      planName: inst.paymentPlan.planName,
      installmentNo: inst.installmentNo,
      dueDate: inst.dueDate.toISOString().slice(0, 10),
      dueAmount: due,
      paidAmount: paid,
      balance,
      status,
    };
  });

  const { min, max } = dueDateBounds(rows);

  return (
    <PaymentScheduleReportsWorkspace
      installmentRows={rows}
      defaultDueDateFrom={min}
      defaultDueDateTo={max}
    />
  );
}
