import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";

export async function GET(request: Request) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const take = Math.min(Math.max(Number(searchParams.get("take") ?? "500"), 1), 2000);
  const skip = Math.max(Number(searchParams.get("skip") ?? "0"), 0);

  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { cnic: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q, mode: "insensitive" as const } },
          { phoneOffice: { contains: q, mode: "insensitive" as const } },
          { phoneRes: { contains: q, mode: "insensitive" as const } },
          { whatsapp: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      take,
      skip,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { nominees: true, bookings: true } },
      },
    }),
    db.customer.count({ where }),
  ]);

  return NextResponse.json({
    customers: customers.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      fatherHusband: c.fatherHusband,
      phone: c.phone,
      phoneOffice: c.phoneOffice,
      phoneRes: c.phoneRes,
      whatsapp: c.whatsapp,
      email: c.email,
      cnic: c.cnic,
      passportNo: c.passportNo,
      nationality: c.nationality,
      postalAddress: c.postalAddress,
      income: c.income != null ? Number(c.income) : null,
      age: c.age,
      occupation: c.occupation,
      broker: c.broker,
      careOf: c.careOf,
      createdAt: c.createdAt.toISOString(),
      nomineeCount: c._count.nominees,
      bookingCount: c._count.bookings,
    })),
    total,
    take,
    skip,
  });
}
