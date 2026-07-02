"use server";

import { InstallmentStatus, LedgerType, PaymentMode, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/current-user";

const MONEY_EPS = 0.01;

export type ReceivingMutationState = { ok: true; message: string; receivingNo?: string } | { ok: false; message: string };

const allocationSchema = z.object({
  bookingId: z.string().min(1),
  installmentId: z.string().optional().nullable(),
  amount: z.coerce.number().positive("Allocation amount must be greater than zero."),
  ledgerType: z.nativeEnum(LedgerType).default(LedgerType.OFFICIAL),
});

const createReceivingSchema = z
  .object({
    customerId: z.string().min(1),
    receivedDate: z.string().min(1),
    mode: z.nativeEnum(PaymentMode),
    receivedBy: z.string().max(200).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    chequeNo: z.string().max(64).optional().nullable(),
    chequeBank: z.string().max(120).optional().nullable(),
    chequeBranch: z.string().max(120).optional().nullable(),
    chequeDrawer: z.string().max(200).optional().nullable(),
    chequeDate: z.string().optional().nullable(),
    chequeStatus: z.string().max(32).optional().nullable(),
    onlineReceivedFrom: z.string().max(200).optional().nullable(),
    onlineReference: z.string().max(120).optional().nullable(),
    allocations: z.array(allocationSchema).min(1, "Add at least one allocation line."),
  })
  .superRefine((data, ctx) => {
    if (data.mode === PaymentMode.CHEQUE) {
      if (!data.chequeNo?.trim()) {
        ctx.addIssue({ code: "custom", message: "Cheque number is required.", path: ["chequeNo"] });
      }
      if (!data.chequeBank?.trim()) {
        ctx.addIssue({ code: "custom", message: "Bank name is required.", path: ["chequeBank"] });
      }
    }
    if (data.mode === PaymentMode.ONLINE && !data.onlineReceivedFrom?.trim()) {
      ctx.addIssue({ code: "custom", message: "Received from is required for online payments.", path: ["onlineReceivedFrom"] });
    }
  });

const voidReceivingSchema = z.object({
  receivingId: z.string().min(1),
  voidReason: z.string().min(1).max(500),
});

async function recalcInstallmentStatus(tx: Prisma.TransactionClient, installmentId: string) {
  const inst = await tx.paymentInstallment.findUnique({
    where: { id: installmentId },
    include: { payments: { where: { voidedAt: null } } },
  });
  if (!inst) return;

  const paid = inst.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const due = Number(inst.dueAmount);

  let status: InstallmentStatus;
  if (paid >= due - MONEY_EPS) {
    status = InstallmentStatus.PAID;
  } else if (paid > MONEY_EPS) {
    status = InstallmentStatus.PARTIAL;
  } else {
    const dueDay = new Date(inst.dueDate);
    dueDay.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    status = dueDay < today ? InstallmentStatus.OVERDUE : InstallmentStatus.PENDING;
  }

  await tx.paymentInstallment.update({
    where: { id: installmentId },
    data: { status },
  });
}

async function generateReceivingNo(tx: Prisma.TransactionClient, date: Date) {
  const year = date.getUTCFullYear();
  const prefix = `RCV-${year}-`;
  const last = await tx.receiving.findFirst({
    where: { receivingNo: { startsWith: prefix } },
    orderBy: { receivingNo: "desc" },
    select: { receivingNo: true },
  });
  const lastSerial = last?.receivingNo ? Number.parseInt(last.receivingNo.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastSerial) ? lastSerial + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

export async function createReceivingAction(input: z.infer<typeof createReceivingSchema>): Promise<ReceivingMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You must be signed in." };
  }

  const parsed = createReceivingSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const msg =
      Object.values(flat.fieldErrors)[0]?.[0] ??
      flat.formErrors[0] ??
      "Invalid receiving data.";
    return { ok: false, message: msg };
  }

  const data = parsed.data;
  const receivedDate = new Date(`${data.receivedDate}T12:00:00`);
  if (Number.isNaN(receivedDate.getTime())) {
    return { ok: false, message: "Invalid received date." };
  }

  const totalAmount = data.allocations.reduce((sum, row) => sum + row.amount, 0);
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { fullName: true },
  });
  const receivedBy = data.receivedBy?.trim() || user?.fullName || null;

  let receivingNo = "";
  try {
    await db.$transaction(async (tx) => {
      const customerBookings = await tx.booking.findMany({
        where: { customerId: data.customerId },
        select: { id: true },
      });
      const bookingIds = new Set(customerBookings.map((b) => b.id));

      for (const alloc of data.allocations) {
        if (!bookingIds.has(alloc.bookingId)) {
          throw new Error("BOOKING_NOT_CUSTOMER");
        }
      }

      receivingNo = await generateReceivingNo(tx, receivedDate);

      const receiving = await tx.receiving.create({
        data: {
          receivingNo,
          customerId: data.customerId,
          receivedDate,
          totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
          mode: data.mode,
          receivedBy,
          chequeNo: data.chequeNo?.trim() || null,
          chequeBank: data.chequeBank?.trim() || null,
          chequeBranch: data.chequeBranch?.trim() || null,
          chequeDrawer: data.chequeDrawer?.trim() || null,
          chequeDate: data.chequeDate ? new Date(`${data.chequeDate}T12:00:00`) : null,
          chequeStatus: data.chequeStatus?.trim() || null,
          onlineReceivedFrom: data.onlineReceivedFrom?.trim() || null,
          onlineReference: data.onlineReference?.trim() || null,
          notes: data.notes?.trim() || null,
        },
      });

      const referenceNo =
        data.mode === PaymentMode.CHEQUE
          ? data.chequeNo?.trim() || null
          : data.mode === PaymentMode.ONLINE
            ? data.onlineReference?.trim() || null
            : null;

      for (const alloc of data.allocations) {
        let instId: string | null = alloc.installmentId?.trim() || null;

        if (instId) {
          const installment = await tx.paymentInstallment.findFirst({
            where: { id: instId, paymentPlan: { bookingId: alloc.bookingId } },
            include: { payments: { where: { voidedAt: null } } },
          });
          if (!installment) throw new Error("INSTALLMENT_NOT_FOUND");

          const alreadyPaid = installment.payments.reduce((s, p) => s + Number(p.amount), 0);
          if (alreadyPaid + alloc.amount > Number(installment.dueAmount) + MONEY_EPS) {
            throw new Error("AMOUNT_EXCEEDS_INSTALLMENT");
          }
        }

        await tx.receivingAllocation.create({
          data: {
            receivingId: receiving.id,
            bookingId: alloc.bookingId,
            installmentId: instId,
            amount: new Prisma.Decimal(alloc.amount.toFixed(2)),
            ledgerType: alloc.ledgerType,
          },
        });

        await tx.payment.create({
          data: {
            bookingId: alloc.bookingId,
            receivingId: receiving.id,
            installmentId: instId,
            paymentDate: receivedDate,
            amount: new Prisma.Decimal(alloc.amount.toFixed(2)),
            mode: data.mode,
            referenceNo,
            receivedBy,
            notes: data.notes?.trim() || null,
            ledgerType: alloc.ledgerType,
          },
        });

        if (instId) {
          await recalcInstallmentStatus(tx, instId);
        }
      }
    });

    return { ok: true, message: `Receiving ${receivingNo} recorded.`, receivingNo };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "BOOKING_NOT_CUSTOMER") return { ok: false, message: "One or more bookings do not belong to this customer." };
    if (msg === "INSTALLMENT_NOT_FOUND") return { ok: false, message: "Installment does not belong to the selected booking." };
    if (msg === "AMOUNT_EXCEEDS_INSTALLMENT") return { ok: false, message: "An allocation exceeds the installment balance." };
    console.error(e);
    return { ok: false, message: "Could not save receiving." };
  }
}

export async function voidReceivingAction(input: z.infer<typeof voidReceivingSchema>): Promise<ReceivingMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You must be signed in." };
  }

  const parsed = voidReceivingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.flatten().fieldErrors.voidReason?.[0] ?? "Invalid request." };
  }

  const { receivingId, voidReason } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const receiving = await tx.receiving.findUnique({
        where: { id: receivingId },
        include: { payments: true, allocations: true },
      });
      if (!receiving) throw new Error("NOT_FOUND");
      if (receiving.voidedAt) throw new Error("ALREADY_VOIDED");

      await tx.receiving.update({
        where: { id: receivingId },
        data: { voidedAt: new Date(), voidReason: voidReason.trim() },
      });

      for (const payment of receiving.payments) {
        if (payment.voidedAt) continue;
        await tx.payment.update({
          where: { id: payment.id },
          data: { voidedAt: new Date(), voidReason: `Receiving voided: ${voidReason.trim()}` },
        });
        if (payment.installmentId) {
          await recalcInstallmentStatus(tx, payment.installmentId);
        }
      }
    });

    return { ok: true, message: "Receiving voided." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return { ok: false, message: "Receiving not found." };
    if (msg === "ALREADY_VOIDED") return { ok: false, message: "This receiving is already voided." };
    console.error(e);
    return { ok: false, message: "Could not void receiving." };
  }
}

export async function settleLiabilityAction(input: { liabilityId: string; notes?: string }): Promise<ReceivingMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You must be signed in." };
  }

  const liability = await db.companyLiability.findUnique({ where: { id: input.liabilityId } });
  if (!liability) return { ok: false, message: "Liability not found." };
  if (liability.status === "SETTLED") return { ok: false, message: "Liability is already settled." };

  await db.companyLiability.update({
    where: { id: input.liabilityId },
    data: {
      status: "SETTLED",
      settledAt: new Date(),
      notes: input.notes?.trim() ? [liability.notes, input.notes.trim()].filter(Boolean).join(" | ") : liability.notes,
    },
  });

  return { ok: true, message: "Liability marked as settled." };
}
