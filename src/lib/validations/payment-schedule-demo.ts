import { z } from "zod";

const moneyField = z.coerce
  .number({ error: "Enter a valid amount." })
  .finite()
  .positive("Amount must be greater than zero.");

const paidField = z.coerce
  .number({ error: "Enter a valid amount." })
  .finite()
  .min(0, "Paid cannot be negative.");

export const paymentScheduleInstallmentRowSchema = z.object({
  installmentNo: z.coerce.number().int().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date (YYYY-MM-DD)."),
  amount: moneyField,
  paidAmount: paidField,
  label: z.string().max(80).optional(),
  notes: z.string().max(240).optional(),
});

export const paymentScheduleDemoSchema = z
  .object({
    bookingId: z.string().trim().min(1, "Select a booking."),
    bookingDisplayLabel: z.string().max(280).optional().transform((v) => (v == null ? "" : v.trim())),
    planTitle: z
      .string()
      .max(120)
      .optional()
      .transform((value) => (value == null ? "" : value.trim())),
    totalAmount: z.coerce.number().finite().min(0, "Contract total is missing for this booking."),
    currency: z.literal("PKR"),
    rows: z
      .array(paymentScheduleInstallmentRowSchema)
      .min(1, "Add at least one installment row.")
      .max(60, "Maximum 60 installments allowed."),
  })
  .superRefine((data, ctx) => {
    if (data.rows.length > 0 && data.totalAmount <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Select a booking with a payable amount.",
        path: ["totalAmount"],
      });
    }
    const sum = data.rows.reduce((acc, row) => acc + row.amount, 0);
    const diff = Math.abs(sum - data.totalAmount);
    if (diff > 0.01) {
      ctx.addIssue({
        code: "custom",
        message: `Row amounts total ${sum.toFixed(2)} but contract is ${data.totalAmount.toFixed(2)}.`,
        path: ["rows"],
      });
    }

    for (let i = 1; i < data.rows.length; i += 1) {
      if (data.rows[i].dueDate < data.rows[i - 1].dueDate) {
        ctx.addIssue({
          code: "custom",
          message: "Keep due dates in order.",
          path: ["rows", i, "dueDate"],
        });
        break;
      }
    }

    data.rows.forEach((row, index) => {
      if (row.paidAmount > row.amount + 0.001) {
        ctx.addIssue({
          code: "custom",
          message: "Paid cannot exceed the installment amount.",
          path: ["rows", index, "paidAmount"],
        });
      }
    });
  });

export type PaymentScheduleDemoInput = z.infer<typeof paymentScheduleDemoSchema>;
export type PaymentScheduleInstallmentRowInput = z.infer<typeof paymentScheduleInstallmentRowSchema>;
