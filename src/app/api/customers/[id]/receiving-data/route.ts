import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { formatUnitLabel } from "@/lib/unit-display";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { id: customerId } = await context.params;

  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, fullName: true, cnic: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const bookings = await db.booking.findMany({
    where: {
      customerId,
      status: { notIn: ["CANCELLED", "TRANSFERRED", "SWITCHED", "MERGED"] },
    },
    orderBy: { bookingDate: "desc" },
    include: {
      unit: { include: { tower: { select: { code: true } } } },
      plan: {
        include: {
          schedules: {
            orderBy: { installmentNo: "asc" },
            include: { payments: { where: { voidedAt: null } } },
          },
        },
      },
    },
  });

  return NextResponse.json({
    customer,
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingNo: b.bookingNo,
      unitLabel: formatUnitLabel(b.unit.tower.code, b.unit.unitNo, b.unit.prefix),
      payableCost: Number(b.payableCost ?? b.grossTotal ?? 0),
      installments: (b.plan?.schedules ?? []).map((inst) => {
        const paid = inst.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const due = Number(inst.dueAmount);
        return {
          id: inst.id,
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate.toISOString().slice(0, 10),
          dueAmount: due,
          paidAmount: paid,
          remaining: Math.max(0, due - paid),
          status: inst.status,
          canAcceptPayment: paid < due - 0.01,
        };
      }),
    })),
  });
}
