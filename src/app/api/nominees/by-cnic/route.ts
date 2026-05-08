import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function normalizeCnicDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

function formatCnicFromDigits(value: string) {
  const digits = normalizeCnicDigits(value);
  if (digits.length !== 13) return value.trim();
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawCnic = (searchParams.get("cnic") ?? "").trim();
  const digits = normalizeCnicDigits(rawCnic);

  if (digits.length !== 13) {
    return NextResponse.json({ nominee: null });
  }

  const formatted = formatCnicFromDigits(digits);
  const candidates = Array.from(new Set([rawCnic, formatted, digits].filter(Boolean)));

  const nominee = await db.nominee.findFirst({
    where: { cnic: { in: candidates } },
    orderBy: { id: "desc" },
    select: {
      name: true,
      relation: true,
      fatherName: true,
      address: true,
      cnic: true,
      passportNo: true,
      cell: true,
    },
  });

  if (!nominee) {
    return NextResponse.json({ nominee: null });
  }

  return NextResponse.json({
    nominee: {
      nomineeName: nominee.name,
      relation: nominee.relation ?? "",
      nomineeFatherName: nominee.fatherName ?? "",
      nomineeAddress: nominee.address ?? "",
      nomineeCnic: nominee.cnic ?? formatted,
      nomineePassport: nominee.passportNo ?? "",
      nomineeCell: nominee.cell ?? "",
    },
  });
}
