import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { formatUnitLabel } from "@/lib/unit-display";
import { effectiveInstallmentStatus } from "@/lib/reports/installment-effective-status";

const MONEY_EPS = 0.01;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { id: bookingId } = await params;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
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
      plan: {
        include: {
          schedules: {
            orderBy: { installmentNo: "asc" },
            include: {
              payments: { where: { voidedAt: null }, select: { amount: true } },
            },
          },
        },
      },
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const schedules = booking.plan?.schedules ?? [];
  const u = booking.unit;

  return NextResponse.json({
    booking: {
      id: booking.id,
      bookingNo: booking.bookingNo,
      status: booking.status,
      customerName: booking.customer.fullName,
      customerCnic: booking.customer.cnic ?? "",
      projectCode: u.project.code,
      unitLabel: formatUnitLabel(u.tower.code, u.unitNo, u.prefix),
      unitStatus: u.listingStatus,
    },
    planName: booking.plan?.planName ?? null,
    installments: schedules.map((s) => {
      const paid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const due = Number(s.dueAmount);
      const remaining = Math.max(0, due - paid);
      const eff = effectiveInstallmentStatus(s.status, s.dueDate, remaining);
      return {
        id: s.id,
        installmentNo: s.installmentNo,
        dueDate: s.dueDate.toISOString().slice(0, 10),
        dueAmount: due.toFixed(2),
        paidAmount: paid.toFixed(2),
        remaining: remaining.toFixed(2),
        status: s.status,
        displayStatus: eff,
        canAcceptPayment: remaining > MONEY_EPS,
      };
    }),
  });
}
