import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { formatUnitLabel } from "@/lib/unit-display";

/** CNIC stored with hyphens; match last digits by normalizing to 13-digit string (PostgreSQL). */
async function bookingIdsMatchingCnicDigitSuffix(digits: string): Promise<string[]> {
  if (digits.length < 3 || digits.length > 13 || !/^\d+$/.test(digits)) return [];

  const rows =
    digits.length === 13
      ? await db.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT b.id::text AS id
          FROM "Booking" b
          INNER JOIN "Customer" c ON c.id = b."customerId"
          WHERE c."cnic" IS NOT NULL
            AND regexp_replace(c."cnic", '[^0-9]', '', 'g') = ${digits}
        `)
      : await db.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT b.id::text AS id
          FROM "Booking" b
          INNER JOIN "Customer" c ON c.id = b."customerId"
          WHERE c."cnic" IS NOT NULL
            AND regexp_replace(c."cnic", '[^0-9]', '', 'g') LIKE ${`%${digits}`}
        `);

  return rows.map((r) => r.id);
}

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

  const digitRun = q.replace(/\D/g, "");
  const cnicSuffixIds = await bookingIdsMatchingCnicDigitSuffix(digitRun);

  const orClause: Prisma.BookingWhereInput[] = [
    { bookingNo: { contains: q, mode: "insensitive" as const } },
    { customer: { fullName: { contains: q, mode: "insensitive" as const } } },
    { customer: { cnic: { contains: q, mode: "insensitive" as const } } },
  ];
  if (cnicSuffixIds.length > 0) {
    orClause.push({ id: { in: cnicSuffixIds } });
  }

  const bookings = await db.booking.findMany({
    where: { OR: orClause },
    take,
    orderBy: { bookingDate: "desc" },
    select: {
      id: true,
      bookingNo: true,
      status: true,
      payableCost: true,
      grossTotal: true,
      customer: { select: { fullName: true, cnic: true } },
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
    bookings: bookings.map((b) => {
      const payable = b.payableCost != null ? Number(b.payableCost) : NaN;
      const gross = b.grossTotal != null ? Number(b.grossTotal) : NaN;
      const contractTotal = Number.isFinite(payable) && payable > 0 ? payable : Number.isFinite(gross) && gross > 0 ? gross : 0;
      return {
        id: b.id,
        bookingNo: b.bookingNo,
        customerName: b.customer.fullName,
        customerCnic: b.customer.cnic ?? null,
        unitLabel: formatUnitLabel(b.unit.tower.code, b.unit.unitNo, b.unit.prefix),
        status: b.status,
        contractTotal,
      };
    }),
  });
}
