"use server";

import { InstallmentStatus, PaymentMode, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/current-user";

const MONEY_EPS = 0.01;

export type PaymentMutationState = { ok: true; message: string } | { ok: false; message: string };

const createPaymentSchema = z.object({
  bookingId: z.string().min(1),
  installmentId: z.string().min(1).optional().nullable(),
  paymentDate: z.string().min(1),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  mode: z.nativeEnum(PaymentMode),
  referenceNo: z.string().max(120).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const voidPaymentSchema = z.object({
  paymentId: z.string().min(1),
  voidReason: z.string().min(1, "Reason is required").max(500),
});

async function recalcInstallmentStatus(tx: Prisma.TransactionClient, installmentId: string) {
  const inst = await tx.paymentInstallment.findUnique({
    where: { id: installmentId },
    include: {
      payments: { where: { voidedAt: null } },
    },
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

export async function createPaymentAction(input: z.infer<typeof createPaymentSchema>): Promise<PaymentMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You must be signed in to record a payment." };
  }

  const parsed = createPaymentSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg = Object.values(first)[0]?.[0] ?? "Invalid payment data.";
    return { ok: false, message: msg };
  }

  const { bookingId, installmentId, paymentDate, amount, mode, referenceNo, notes } = parsed.data;
  const date = new Date(`${paymentDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: "Invalid payment date." };
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { fullName: true },
  });
  const receivedBy = user?.fullName ?? null;

  try {
    await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { plan: true },
      });
      if (!booking) {
        throw new Error("BOOKING_NOT_FOUND");
      }

      let instId: string | null = installmentId?.trim() ? installmentId.trim() : null;

      if (instId) {
        const installment = await tx.paymentInstallment.findFirst({
          where: { id: instId, paymentPlan: { bookingId } },
          include: {
            payments: { where: { voidedAt: null } },
          },
        });
        if (!installment) {
          throw new Error("INSTALLMENT_NOT_FOUND");
        }

        const alreadyPaid = installment.payments.reduce((s, p) => s + Number(p.amount), 0);
        const due = Number(installment.dueAmount);
        if (alreadyPaid + amount > due + MONEY_EPS) {
          throw new Error("AMOUNT_EXCEEDS_INSTALLMENT");
        }
      } else {
        instId = null;
      }

      await tx.payment.create({
        data: {
          bookingId,
          installmentId: instId,
          paymentDate: date,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          mode,
          referenceNo: referenceNo?.trim() || null,
          notes: notes?.trim() || null,
          receivedBy,
        },
      });

      if (instId) {
        await recalcInstallmentStatus(tx, instId);
      }
    });

    return { ok: true, message: "Payment recorded." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "BOOKING_NOT_FOUND") return { ok: false, message: "Booking not found." };
    if (msg === "INSTALLMENT_NOT_FOUND") return { ok: false, message: "Installment does not belong to this booking." };
    if (msg === "AMOUNT_EXCEEDS_INSTALLMENT") {
      return { ok: false, message: "Amount exceeds the remaining balance for this installment." };
    }
    console.error(e);
    return { ok: false, message: "Could not save payment." };
  }
}

export async function voidPaymentAction(input: z.infer<typeof voidPaymentSchema>): Promise<PaymentMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You must be signed in to void a payment." };
  }

  const parsed = voidPaymentSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors.voidReason?.[0] ?? "Invalid request.";
    return { ok: false, message: msg };
  }

  const { paymentId, voidReason } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
      });
      if (!payment) {
        throw new Error("NOT_FOUND");
      }
      if (payment.voidedAt) {
        throw new Error("ALREADY_VOIDED");
      }

      await tx.payment.update({
        where: { id: paymentId },
        data: {
          voidedAt: new Date(),
          voidReason: voidReason.trim(),
        },
      });

      if (payment.installmentId) {
        await recalcInstallmentStatus(tx, payment.installmentId);
      }
    });

    return { ok: true, message: "Payment voided." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") return { ok: false, message: "Payment not found." };
    if (msg === "ALREADY_VOIDED") return { ok: false, message: "This payment is already voided." };
    console.error(e);
    return { ok: false, message: "Could not void payment." };
  }
}
