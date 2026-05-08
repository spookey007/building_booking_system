import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";

const MONEY_EPS = 0.01;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { id: bookingId } = await params;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
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

  return NextResponse.json({
    planName: booking.plan?.planName ?? null,
    installments: schedules.map((s) => {
      const paid = s.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const due = Number(s.dueAmount);
      const remaining = Math.max(0, due - paid);
      return {
        id: s.id,
        installmentNo: s.installmentNo,
        dueDate: s.dueDate.toISOString().slice(0, 10),
        dueAmount: due.toFixed(2),
        paidAmount: paid.toFixed(2),
        remaining: remaining.toFixed(2),
        status: s.status,
        canAcceptPayment: remaining > MONEY_EPS,
      };
    }),
  });
}
