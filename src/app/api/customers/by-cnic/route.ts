import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeCnicDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(-12);
}

function formatCnicFromDigits(value: string) {
  const digits = normalizeCnicDigits(value);
  if (digits.length !== 13) return value.trim();
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCnic = (searchParams.get("cnic") ?? "").trim();
  const rawPhone = (searchParams.get("phone") ?? "").trim();
  const digits = normalizeCnicDigits(rawCnic);
  const phoneDigits = normalizePhoneDigits(rawPhone);

  if (digits.length !== 13 && phoneDigits.length < 10) {
    return NextResponse.json({ customer: null });
  }

  const formatted = formatCnicFromDigits(digits);
  const cnicCandidates = Array.from(new Set([rawCnic, formatted, digits].filter(Boolean)));

  const phoneFieldMatches = phoneDigits.length >= 10
    ? {
        OR: [
          { phone: { contains: phoneDigits, mode: "insensitive" as const } },
          { phoneOffice: { contains: phoneDigits, mode: "insensitive" as const } },
          { phoneRes: { contains: phoneDigits, mode: "insensitive" as const } },
          { whatsapp: { contains: phoneDigits, mode: "insensitive" as const } },
          { phone: { contains: rawPhone, mode: "insensitive" as const } },
          { phoneOffice: { contains: rawPhone, mode: "insensitive" as const } },
          { phoneRes: { contains: rawPhone, mode: "insensitive" as const } },
          { whatsapp: { contains: rawPhone, mode: "insensitive" as const } },
        ],
      }
    : null;

  const whereClause =
    digits.length === 13
      ? { cnic: { in: cnicCandidates } }
      : phoneFieldMatches ?? { cnic: { in: [] } };

  const customer = await db.customer.findFirst({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    select: {
      fullName: true,
      fatherHusband: true,
      phoneOffice: true,
      phoneRes: true,
      whatsapp: true,
      email: true,
      cnic: true,
      passportNo: true,
      nationality: true,
      postalAddress: true,
      income: true,
      age: true,
      occupation: true,
      broker: true,
      careOf: true,
      nominees: {
        select: {
          name: true,
          relation: true,
          fatherName: true,
          address: true,
          cnic: true,
          passportNo: true,
          cell: true,
        },
        take: 1,
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ customer: null });
  }

  const nominee = customer.nominees[0];
  return NextResponse.json({
    customer: {
      fullName: customer.fullName,
      fatherHusband: customer.fatherHusband ?? "",
      phoneOffice: customer.phoneOffice ?? "",
      phoneRes: customer.phoneRes ?? "",
      whatsapp: customer.whatsapp ?? "",
      email: customer.email ?? "",
      cnic: customer.cnic ?? formatted,
      passportNo: customer.passportNo ?? "",
      nationality: customer.nationality ?? "",
      postalAddress: customer.postalAddress ?? "",
      income: customer.income?.toString() ?? "",
      age: customer.age?.toString() ?? "",
      occupation: customer.occupation ?? "",
      broker: customer.broker ?? "",
      careOf: customer.careOf ?? "",
      nomineeName: nominee?.name ?? "",
      relation: nominee?.relation ?? "",
      nomineeFatherName: nominee?.fatherName ?? "",
      nomineeAddress: nominee?.address ?? "",
      nomineeCnic: nominee?.cnic ?? "",
      nomineePassport: nominee?.passportNo ?? "",
      nomineeCell: nominee?.cell ?? "",
    },
  });
}
