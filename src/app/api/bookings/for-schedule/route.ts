import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { formatUnitLabel } from "@/lib/unit-display";

/** Small, query-bound booking search for payment schedule (never returns unbounded lists). */
export async function GET(request: Request) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const take = Math.min(Math.max(Number(searchParams.get("take") ?? "12"), 1), 25);

  if (q.length < 2) {
    return NextResponse.json({ bookings: [] });
  }

  const bookings = await db.booking.findMany({
    where: {
      OR: [
        { bookingNo: { contains: q, mode: "insensitive" as const } },
        { customer: { fullName: { contains: q, mode: "insensitive" as const } } },
        { customer: { cnic: { contains: q, mode: "insensitive" as const } } },
      ],
    },
    take,
    orderBy: { bookingDate: "desc" },
    select: {
      id: true,
      bookingNo: true,
      status: true,
      customer: { select: { fullName: true } },
      unit: {
        select: {
          unitNo: true,
          prefix: true,
          tower: { select: { code: true } },
        },
      },
    },
  });

  return NextResponse.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingNo: b.bookingNo,
      customerName: b.customer.fullName,
      unitLabel: formatUnitLabel(b.unit.tower.code, b.unit.unitNo, b.unit.prefix),
      status: b.status,
    })),
  });
}
