import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { formatUnitLabel } from "@/lib/unit-display";

export async function GET(request: Request) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const take = Math.min(Math.max(Number(searchParams.get("take") ?? "40"), 1), 100);

  const where = q
    ? {
        OR: [
          { bookingNo: { contains: q, mode: "insensitive" as const } },
          { customer: { fullName: { contains: q, mode: "insensitive" as const } } },
          { customer: { cnic: { contains: q, mode: "insensitive" as const } } },
          { customer: { phone: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {};

  const bookings = await db.booking.findMany({
    where,
    take,
    orderBy: { bookingDate: "desc" },
    include: {
      customer: { select: { fullName: true } },
      unit: {
        include: {
          tower: { select: { code: true } },
        },
      },
      plan: { select: { id: true, planName: true } },
    },
  });

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingNo: b.bookingNo,
      customerName: b.customer.fullName,
      unitLabel: formatUnitLabel(b.unit.tower.code, b.unit.unitNo, b.unit.prefix),
      status: b.status,
      hasPlan: Boolean(b.plan),
      planName: b.plan?.planName ?? null,
    })),
  });
}
