import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/api-auth";
import { customerUpdateSchema } from "@/lib/validations/customer";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { id } = await params;
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      nominees: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          name: true,
          relation: true,
          fatherName: true,
          address: true,
          cnic: true,
          cell: true,
          passportNo: true,
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json({
    customer: {
      id: customer.id,
      fullName: customer.fullName,
      fatherHusband: customer.fatherHusband,
      phone: customer.phone,
      phoneOffice: customer.phoneOffice,
      phoneRes: customer.phoneRes,
      whatsapp: customer.whatsapp,
      email: customer.email,
      cnic: customer.cnic,
      passportNo: customer.passportNo,
      nationality: customer.nationality,
      postalAddress: customer.postalAddress,
      income: customer.income != null ? Number(customer.income) : null,
      age: customer.age,
      occupation: customer.occupation,
      broker: customer.broker,
      careOf: customer.careOf,
      nominees: customer.nominees,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireApiSession();
  if (!session) return error;

  const { id } = await params;
  const existing = await db.customer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    );
  }

  const data = parsed.data;
  if (data.cnic) {
    const digits = data.cnic.replace(/\D/g, "");
    const formatted =
      digits.length === 13
        ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`
        : data.cnic.trim();
    const variants = [...new Set([formatted, digits, data.cnic.trim()].filter(Boolean))];
    const dup = await db.customer.findFirst({
      where: { id: { not: id }, cnic: { in: variants } },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ error: "Another customer already uses this CNIC" }, { status: 409 });
    }
  }

  const updated = await db.customer.update({
    where: { id },
    data: {
      fullName: data.fullName,
      fatherHusband: data.fatherHusband ?? null,
      phone: data.phone ?? null,
      phoneOffice: data.phoneOffice ?? null,
      phoneRes: data.phoneRes ?? null,
      whatsapp: data.whatsapp ?? null,
      email: data.email ?? null,
      cnic: data.cnic ?? null,
      passportNo: data.passportNo ?? null,
      nationality: data.nationality ?? null,
      postalAddress: data.postalAddress ?? null,
      income: data.income != null ? String(data.income) : null,
      age: data.age ?? null,
      occupation: data.occupation ?? null,
      broker: data.broker ?? null,
      careOf: data.careOf ?? null,
    },
  });

  return NextResponse.json({
    customer: {
      id: updated.id,
      fullName: updated.fullName,
      fatherHusband: updated.fatherHusband,
      phone: updated.phone,
      phoneOffice: updated.phoneOffice,
      phoneRes: updated.phoneRes,
      whatsapp: updated.whatsapp,
      email: updated.email,
      cnic: updated.cnic,
      passportNo: updated.passportNo,
      nationality: updated.nationality,
      postalAddress: updated.postalAddress,
      income: updated.income != null ? Number(updated.income) : null,
      age: updated.age,
      occupation: updated.occupation,
      broker: updated.broker,
      careOf: updated.careOf,
    },
  });
}
