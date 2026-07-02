"use server";

import { InstallmentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/current-user";
import { assertInstallmentCount } from "@/lib/constants/payment-plan";
import { paymentScheduleDemoSchema } from "@/lib/validations/payment-schedule-demo";

const MONEY_EPS = 0.01;

export type PaymentPlanMutationState = { ok: true; message: string } | { ok: false; message: string };

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

export async function savePaymentPlanAction(payload: unknown): Promise<PaymentPlanMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You must be signed in." };
  }

  const parsed = paymentScheduleDemoSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const msg =
      flat.fieldErrors.rows?.[0] ??
      flat.fieldErrors.bookingId?.[0] ??
      flat.formErrors[0] ??
      "Invalid payment schedule.";
    return { ok: false, message: msg };
  }

  const data = parsed.data;
  assertInstallmentCount(data.rows.length);

  const booking = await db.booking.findUnique({
    where: { id: data.bookingId },
    include: { plan: { include: { schedules: true } } },
  });
  if (!booking) {
    return { ok: false, message: "Booking not found." };
  }

  const planName = data.planTitle?.trim() || `Plan for ${booking.bookingNo}`;
  const startDate = new Date(`${data.rows[0].dueDate}T12:00:00`);
  const totalAmount = data.rows.reduce((sum, row) => sum + row.amount, 0);

  try {
    await db.$transaction(async (tx) => {
      const existingPlan = booking.plan;

      if (existingPlan) {
        const paidByInstallment = new Map<string, number>();
        for (const schedule of existingPlan.schedules) {
          const paidAgg = await tx.payment.aggregate({
            where: { installmentId: schedule.id, voidedAt: null },
            _sum: { amount: true },
          });
          paidByInstallment.set(schedule.id, Number(paidAgg._sum.amount ?? 0));
        }

        await tx.paymentInstallment.deleteMany({ where: { paymentPlanId: existingPlan.id } });
        await tx.paymentPlan.update({
          where: { id: existingPlan.id },
          data: {
            planName,
            totalInstallments: data.rows.length,
            startDate,
            totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
          },
        });

        for (const row of data.rows) {
          const dueDate = new Date(`${row.dueDate}T12:00:00`);
          const inst = await tx.paymentInstallment.create({
            data: {
              paymentPlanId: existingPlan.id,
              installmentNo: row.installmentNo,
              dueDate,
              dueAmount: new Prisma.Decimal(row.amount.toFixed(2)),
              status: InstallmentStatus.PENDING,
            },
          });

          const seedPaid = Math.min(row.paidAmount ?? 0, row.amount);
          if (seedPaid > MONEY_EPS) {
            await tx.payment.create({
              data: {
                bookingId: booking.id,
                installmentId: inst.id,
                paymentDate: dueDate,
                amount: new Prisma.Decimal(seedPaid.toFixed(2)),
                mode: "OTHER",
                notes: "Imported from payment schedule builder",
                ledgerType: "OFFICIAL",
              },
            });
          }
          await recalcInstallmentStatus(tx, inst.id);
        }
      } else {
        const plan = await tx.paymentPlan.create({
          data: {
            bookingId: booking.id,
            planName,
            totalInstallments: data.rows.length,
            startDate,
            totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
          },
        });

        for (const row of data.rows) {
          const dueDate = new Date(`${row.dueDate}T12:00:00`);
          const inst = await tx.paymentInstallment.create({
            data: {
              paymentPlanId: plan.id,
              installmentNo: row.installmentNo,
              dueDate,
              dueAmount: new Prisma.Decimal(row.amount.toFixed(2)),
              status: InstallmentStatus.PENDING,
            },
          });

          const seedPaid = Math.min(row.paidAmount ?? 0, row.amount);
          if (seedPaid > MONEY_EPS) {
            await tx.payment.create({
              data: {
                bookingId: booking.id,
                installmentId: inst.id,
                paymentDate: dueDate,
                amount: new Prisma.Decimal(seedPaid.toFixed(2)),
                mode: "OTHER",
                notes: "Imported from payment schedule builder",
                ledgerType: "OFFICIAL",
              },
            });
          }
          await recalcInstallmentStatus(tx, inst.id);
        }
      }
    });

    return { ok: true, message: "Payment schedule saved to database." };
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Could not save payment schedule." };
  }
}

export async function loadPaymentPlanForBooking(bookingId: string) {
  const plan = await db.paymentPlan.findUnique({
    where: { bookingId },
    include: {
      schedules: {
        orderBy: { installmentNo: "asc" },
        include: {
          payments: { where: { voidedAt: null } },
        },
      },
    },
  });
  if (!plan) return null;

  return {
    planName: plan.planName,
    totalAmount: Number(plan.totalAmount),
    rows: plan.schedules.map((s) => ({
      installmentNo: s.installmentNo,
      dueDate: s.dueDate.toISOString().slice(0, 10),
      amount: Number(s.dueAmount),
      paidAmount: s.payments.reduce((sum, p) => sum + Number(p.amount), 0),
      status: s.status,
    })),
  };
}
