"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/current-user";
import { formatUnitLabel, normalizeUnitNoForStorage } from "@/lib/unit-display";
import { bookingFormSchema } from "@/lib/validations/booking-form";
import { assertInstallmentCount, MAX_INSTALLMENTS } from "@/lib/constants/payment-plan";
import { z } from "zod";

/** Units that can receive a new active booking (not already sold/booked to another party). */
const BOOKABLE_LISTING_STATUSES = ["AVAILABLE", "HOLD"] as const;
const CLOSED_BOOKING_STATUSES = ["CANCELLED", "TRANSFERRED", "SWITCHED", "MERGED"] as const;

function isBookableListingStatus(status: string) {
  return (BOOKABLE_LISTING_STATUSES as readonly string[]).includes(status);
}

function getClosedStatuses() {
  return [...CLOSED_BOOKING_STATUSES];
}

function isClosedBookingStatus(status: string) {
  return (CLOSED_BOOKING_STATUSES as readonly string[]).includes(status);
}

export type BookingActionState =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export type BookingMutationState =
  | { ok: true; message: string }
  | { ok: false; message: string };

type BookingFormActionState =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

function addFieldError(fieldErrors: Record<string, string[]>, key: string, message: string) {
  const current = fieldErrors[key] ?? [];
  fieldErrors[key] = [...current, message];
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

type BookingAddonAmounts = {
  addonParking?: number;
  addonUtility?: number;
  addonDocumentation?: number;
  addonTax?: number;
  addonPenalty?: number;
  bookingTransferFee?: number;
};

function sumBookingAddons(args: BookingAddonAmounts) {
  return (
    (args.addonParking ?? 0) +
    (args.addonUtility ?? 0) +
    (args.addonDocumentation ?? 0) +
    (args.addonTax ?? 0) +
    (args.addonPenalty ?? 0) +
    (args.bookingTransferFee ?? 0)
  );
}

function calculateFinancials(
  args: {
    mode: "REGULAR" | "TRANSFER" | "CANCEL" | "SWITCHING" | "GIFT" | "MERGE";
    unitPrice: number;
    unitTransferCharges: number;
    discountAmount: number;
    cashPayable: number;
  } & BookingAddonAmounts,
) {
  const transferCharges = args.mode === "TRANSFER" ? args.unitTransferCharges : 0;
  const addonTotal = sumBookingAddons(args);
  const grossTotal = args.unitPrice + transferCharges + addonTotal - args.discountAmount;
  const payableCost = grossTotal + args.cashPayable;
  return { transferCharges, grossTotal, payableCost };
}

type ParsedBookingFormValues = z.infer<typeof bookingFormSchema>;

function getSwitchDateForMode(mode: ParsedBookingFormValues["mode"], switchingDate: Date | null) {
  if (!switchingDate || Number.isNaN(switchingDate.getTime())) return null;
  return mode === "SWITCHING" ? switchingDate : null;
}

function getTransferDateForMode(mode: ParsedBookingFormValues["mode"], transferDate: Date | null) {
  if (!transferDate || Number.isNaN(transferDate.getTime())) return null;
  return mode === "TRANSFER" ? transferDate : null;
}

function normalizePhoneForLookup(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "").slice(-12);
}

async function createCustomerFromValues(
  tx: Prisma.TransactionClient,
  values: ParsedBookingFormValues,
) {
  const customer = await tx.customer.create({
    data: {
      fullName: values.fullName,
      fatherHusband: values.fatherHusband ?? null,
      phoneOffice: values.phoneOffice ?? null,
      phoneRes: values.phoneRes ?? null,
      whatsapp: values.whatsapp ?? null,
      phone: values.whatsapp ?? values.phoneRes ?? values.phoneOffice ?? null,
      email: values.email ?? null,
      cnic: values.cnic ?? null,
      passportNo: values.passportNo ?? null,
      nationality: values.nationality ?? null,
      postalAddress: values.postalAddress,
      income: values.income ?? null,
      age: values.age ?? null,
      occupation: values.occupation ?? null,
      broker: values.broker ?? null,
      careOf: values.careOf ?? null,
    },
  });

  if (values.nomineeName) {
    await tx.nominee.create({
      data: {
        customerId: customer.id,
        name: values.nomineeName,
        relation: values.relation ?? null,
        fatherName: values.nomineeFatherName ?? null,
        address: values.nomineeAddress ?? null,
        cnic: values.nomineeCnic ?? null,
        passportNo: values.nomineePassport ?? null,
        cell: values.nomineeCell ?? null,
      },
    });
  }

  return customer.id;
}

async function resetInstallmentPlanFromPreviousBooking(args: {
  tx: Prisma.TransactionClient;
  fromBookingId: string;
  toBookingId: string;
  startDate: Date;
}) {
  const existingPlan = await args.tx.paymentPlan.findUnique({
    where: { bookingId: args.fromBookingId },
    include: {
      schedules: {
        orderBy: { installmentNo: "asc" },
        include: { payments: { where: { voidedAt: null } } },
      },
    },
  });

  if (!existingPlan) return;

  const installmentCount = Math.min(existingPlan.totalInstallments, MAX_INSTALLMENTS);
  assertInstallmentCount(installmentCount);

  const newPlan = await args.tx.paymentPlan.create({
    data: {
      bookingId: args.toBookingId,
      planName: `${existingPlan.planName} (Restarted)`,
      totalInstallments: installmentCount,
      startDate: args.startDate,
      totalAmount: existingPlan.totalAmount,
    },
  });

  if (existingPlan.schedules.length === 0) return;

  for (let index = 0; index < installmentCount; index += 1) {
    const schedule = existingPlan.schedules[index];
    if (!schedule) break;

    const dueDate = new Date(args.startDate);
    dueDate.setMonth(dueDate.getMonth() + index);

    const paidOnOld = schedule.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const dueAmount = Number(schedule.dueAmount);

    let status: "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" = "PENDING";
    if (paidOnOld >= dueAmount - 0.01) {
      status = "PAID";
    } else if (paidOnOld > 0.01) {
      status = "PARTIAL";
    } else {
      const dueDay = new Date(schedule.dueDate);
      dueDay.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDay < today) status = "OVERDUE";
    }

    await args.tx.paymentInstallment.create({
      data: {
        paymentPlanId: newPlan.id,
        installmentNo: index + 1,
        dueDate,
        dueAmount: schedule.dueAmount,
        status,
      },
    });
  }
}

async function generateBookingNo(tx: Prisma.TransactionClient, bookingDate: Date) {
  const year = bookingDate.getUTCFullYear();
  const prefix = `BK-${year}-`;
  const last = await tx.booking.findFirst({
    where: { bookingNo: { startsWith: prefix } },
    orderBy: { bookingNo: "desc" },
    select: { bookingNo: true },
  });

  const lastSerial = last?.bookingNo ? Number.parseInt(last.bookingNo.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastSerial) ? lastSerial + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

export async function submitBookingDraftAction(payload: unknown): Promise<BookingActionState> {
  const parsed = bookingFormSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = Object.fromEntries(
      Object.entries(flat.fieldErrors).filter(([, v]) => Array.isArray(v) && v.length > 0),
    ) as Record<string, string[]>;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const session = await getCurrentSession();
  if (!session?.userId) {
    return {
      ok: false,
      message: "You are not logged in.",
    };
  }

  const values = parsed.data;
  const bookingDate = new Date(values.bookingDate);
  if (Number.isNaN(bookingDate.getTime())) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { bookingDate: ["Invalid booking date"] },
    };
  }

  const unit = await db.unit.findFirst({
    where: {
      unitNo: values.unitNo,
      tower: { code: values.tower },
      project: { code: values.projectCode },
    },
    include: {
      project: { select: { id: true, code: true } },
      tower: { select: { id: true, code: true } },
    },
  });

  if (!unit) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        unitNo: ["Selected unit was not found for this project and tower."],
      },
    };
  }

  if (values.mode !== "CANCEL" && !isBookableListingStatus(unit.listingStatus)) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        unitNo: ["This unit is not available for booking (already booked or not on sale)."],
      },
    };
  }

  const unitBasePrice = Number(unit.basePrice ?? 0);
  const unitTransferCharges = Number(unit.transferCharges ?? 0);
  const discountAmount = values.discountAmount ?? 0;
  const cashPayable = values.cashPayable ?? 0;
  const { grossTotal, payableCost } = calculateFinancials({
    mode: values.mode,
    unitPrice: unitBasePrice,
    unitTransferCharges,
    discountAmount,
    cashPayable,
    addonParking: values.addonParking,
    addonUtility: values.addonUtility,
    addonDocumentation: values.addonDocumentation,
    addonTax: values.addonTax,
    addonPenalty: values.addonPenalty,
    bookingTransferFee: values.bookingTransferFee,
  });

  const fieldErrors: Record<string, string[]> = {};
  if (values.priceOfUnit !== undefined && Math.abs(values.priceOfUnit - unitBasePrice) > 0.01) {
    addFieldError(fieldErrors, "priceOfUnit", "Unit price was updated from latest unit data.");
  }
  if (values.mode === "TRANSFER" && Math.abs((values.transferCharges ?? 0) - unitTransferCharges) > 0.01) {
    addFieldError(fieldErrors, "transferCharges", "Transfer charges were updated from latest unit data.");
  }
  if (grossTotal < 0) {
    addFieldError(fieldErrors, "discountAmount", "Discount cannot exceed unit price, transfer charges, and add-ons.");
  }
  if (payableCost < 0) {
    addFieldError(fieldErrors, "payableCost", "Payable cost cannot be negative.");
  }
  if (unit.basePrice == null) {
    addFieldError(fieldErrors, "priceOfUnit", "Selected unit has no base price configured.");
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  let switchToUnitId: string | null = null;
  if (values.mode === "SWITCHING" || values.mode === "TRANSFER") {
    const rawTarget = (values.switchToUnitNo ?? "").trim().toUpperCase();
    const normalizedTarget = normalizeUnitNoForStorage(values.tower, rawTarget);
    const candidates = await db.unit.findMany({
      where: {
        project: { code: values.projectCode },
        OR: [{ unitNo: rawTarget }, { unitNo: normalizedTarget }],
      },
      select: {
        id: true,
        unitNo: true,
        prefix: true,
        listingStatus: true,
        tower: { select: { code: true } },
      },
      take: 20,
    });

    const matched = candidates.find((candidate) => {
      const label = formatUnitLabel(candidate.tower.code, candidate.unitNo, candidate.prefix).toUpperCase();
      return label === rawTarget || candidate.unitNo.toUpperCase() === rawTarget || candidate.unitNo.toUpperCase() === normalizedTarget;
    });
    switchToUnitId = matched?.id ?? null;
    if (
      switchToUnitId &&
      switchToUnitId !== unit.id &&
      matched &&
      !isBookableListingStatus(matched.listingStatus)
    ) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: {
          switchToUnitNo: ["Target unit is not available for transfer or switching."],
        },
      };
    }
  }

  if ((values.mode === "SWITCHING" || values.mode === "TRANSFER") && !switchToUnitId) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        switchToUnitNo: ["Target unit not found in selected project."],
      },
    };
  }

  const switchingDate = values.switchingDate ? new Date(values.switchingDate) : null;
  const transferDate = values.transferDate ? new Date(values.transferDate) : null;
  const cancelDate = values.cancelDate ? new Date(values.cancelDate) : null;
  let createdBookingNo = "";

  try {
    await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          fullName: values.fullName,
          fatherHusband: values.fatherHusband ?? null,
          phoneOffice: values.phoneOffice ?? null,
          phoneRes: values.phoneRes ?? null,
          whatsapp: values.whatsapp ?? null,
          phone: values.whatsapp ?? values.phoneRes ?? values.phoneOffice ?? null,
          email: values.email ?? null,
          cnic: values.cnic ?? null,
          passportNo: values.passportNo ?? null,
          nationality: values.nationality ?? null,
          postalAddress: values.postalAddress,
          income: values.income ?? null,
          age: values.age ?? null,
          occupation: values.occupation ?? null,
          broker: values.broker ?? null,
          careOf: values.careOf ?? null,
        },
      });

      if (values.nomineeName) {
        await tx.nominee.create({
          data: {
            customerId: customer.id,
            name: values.nomineeName,
            relation: values.relation ?? null,
            fatherName: values.nomineeFatherName ?? null,
            address: values.nomineeAddress ?? null,
            cnic: values.nomineeCnic ?? null,
            passportNo: values.nomineePassport ?? null,
            cell: values.nomineeCell ?? null,
          },
        });
      }

      const bookingNo = await generateBookingNo(tx, bookingDate);
      createdBookingNo = bookingNo;

      if (values.mode !== "CANCEL") {
        const reserved = await tx.unit.updateMany({
          where: {
            id: unit.id,
            listingStatus: { in: [...BOOKABLE_LISTING_STATUSES] },
          },
          data: { listingStatus: "BOOKED" },
        });
        if (reserved.count !== 1) {
          throw new Error("UNIT_NOT_BOOKABLE");
        }
      }

      await tx.booking.create({
        data: {
          bookingNo,
          projectId: unit.projectId,
          unitId: unit.id,
          customerId: customer.id,
          bookedByUserId: session.userId,
          bookingDate,
          mode: values.mode,
          status: "DRAFT",
          transferDate: getTransferDateForMode(values.mode, transferDate),
          switchingDate: switchingDate && !Number.isNaN(switchingDate.getTime()) ? switchingDate : null,
          switchDate: getSwitchDateForMode(values.mode, switchingDate),
          switchToUnitId,
          cancelDate: cancelDate && !Number.isNaN(cancelDate.getTime()) ? cancelDate : null,
          currentDateAtBooking: new Date(`${toDateOnly(new Date())}T00:00:00.000Z`),
          categoryAtBooking: values.category ?? null,
          unitPrice: unitBasePrice,
          cashPayable,
          discountAmount,
          grossTotal,
          payableCost,
          addonParking: values.addonParking ?? null,
          addonUtility: values.addonUtility ?? null,
          addonDocumentation: values.addonDocumentation ?? null,
          addonTax: values.addonTax ?? null,
          addonPenalty: values.addonPenalty ?? null,
          bookingTransferFee: values.bookingTransferFee ?? null,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNIT_NOT_BOOKABLE") {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: {
          unitNo: ["This unit was just booked by someone else. Pick another unit."],
        },
      };
    }
    return {
      ok: false,
      message: "Unable to save booking right now. Please try again.",
    };
  }

  return {
    ok: true,
    message: `Booking ${createdBookingNo} saved successfully.`,
  };
}

const updateBookingSchema = z.object({
  id: z.string().min(1),
  bookingDate: z
    .string()
    .min(1)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid booking date"),
  mode: z.enum(["REGULAR", "TRANSFER", "CANCEL", "SWITCHING", "GIFT"]),
  discountAmount: z.number().min(0),
  cashPayable: z.number().min(0),
  notes: z.string().max(4000).optional(),
});

export async function updateBookingAction(payload: unknown): Promise<BookingMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You are not logged in." };
  }

  const parsed = updateBookingSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "Invalid booking payload." };
  }
  const input = parsed.data;

  const booking = await db.booking.findUnique({
    where: { id: input.id },
    include: { unit: true },
  });
  if (!booking) {
    return { ok: false, message: "Booking not found." };
  }

  const unitPrice = Number(booking.unit.basePrice ?? booking.unitPrice ?? 0);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { ok: false, message: "Unit base price is missing or invalid." };
  }
  const unitTransferCharges = Number(booking.unit.transferCharges ?? 0);
  const { grossTotal, payableCost } = calculateFinancials({
    mode: input.mode,
    unitPrice,
    unitTransferCharges,
    discountAmount: input.discountAmount,
    cashPayable: input.cashPayable,
    addonParking: Number(booking.addonParking ?? 0),
    addonUtility: Number(booking.addonUtility ?? 0),
    addonDocumentation: Number(booking.addonDocumentation ?? 0),
    addonTax: Number(booking.addonTax ?? 0),
    addonPenalty: Number(booking.addonPenalty ?? 0),
    bookingTransferFee: Number(booking.bookingTransferFee ?? 0),
  });
  if (grossTotal < 0) {
    return { ok: false, message: "Discount cannot exceed unit price, transfer charges, and add-ons." };
  }
  if (payableCost < 0) {
    return { ok: false, message: "Payable cost cannot be negative." };
  }

  const bookingDate = new Date(input.bookingDate);
  try {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: input.id },
        data: {
          bookingDate,
          mode: input.mode,
          discountAmount: input.discountAmount,
          cashPayable: input.cashPayable,
          unitPrice,
          grossTotal,
          payableCost,
          notes: input.notes?.trim() || null,
        },
      });

      await tx.unit.update({
        where: { id: booking.unitId },
        data: {
          listingStatus: input.mode === "CANCEL" ? "AVAILABLE" : "BOOKED",
        },
      });
    });
  } catch {
    return { ok: false, message: "Unable to update booking." };
  }

  return { ok: true, message: `Booking ${booking.bookingNo} updated.` };
}

export async function voidBookingAction(bookingId: string): Promise<BookingMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You are not logged in." };
  }
  if (!bookingId) {
    return { ok: false, message: "Invalid booking id." };
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, bookingNo: true, unitId: true, status: true, notes: true },
  });
  if (!booking) {
    return { ok: false, message: "Booking not found." };
  }
  if (isClosedBookingStatus(booking.status)) {
    return { ok: false, message: "Closed bookings cannot be voided again." };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          notes: [booking.notes, "VOIDED"].filter(Boolean).join(" | "),
        },
      });
      const otherActive = await tx.booking.count({
        where: {
          unitId: booking.unitId,
          status: { notIn: getClosedStatuses() },
          id: { not: bookingId },
        },
      });
      if (otherActive === 0) {
        await tx.unit.update({
          where: { id: booking.unitId },
          data: { listingStatus: "AVAILABLE" },
        });
      }
    });
  } catch {
    return { ok: false, message: "Unable to void booking." };
  }

  return { ok: true, message: `Booking ${booking.bookingNo} voided.` };
}

export async function updateBookingFromFormAction(
  bookingId: string,
  payload: unknown,
): Promise<BookingFormActionState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You are not logged in." };
  }
  if (!bookingId) {
    return { ok: false, message: "Invalid booking id." };
  }

  const parsed = bookingFormSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = Object.fromEntries(
      Object.entries(flat.fieldErrors).filter(([, v]) => Array.isArray(v) && v.length > 0),
    ) as Record<string, string[]>;
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }
  const values = parsed.data;

  const existing = await db.booking.findUnique({
    where: { id: bookingId },
    include: { customer: { include: { nominees: true } }, unit: true },
  });
  if (!existing) {
    return { ok: false, message: "Booking not found." };
  }
  if (isClosedBookingStatus(existing.status)) {
    return { ok: false, message: "Closed bookings cannot be edited. Create a new booking instead." };
  }

  const bookingDate = new Date(values.bookingDate);
  if (Number.isNaN(bookingDate.getTime())) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { bookingDate: ["Invalid booking date"] },
    };
  }

  const unit = await db.unit.findFirst({
    where: {
      unitNo: values.unitNo,
      tower: { code: values.tower },
      project: { code: values.projectCode },
    },
    select: {
      id: true,
      projectId: true,
      basePrice: true,
      transferCharges: true,
      listingStatus: true,
    },
  });
  if (!unit) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { unitNo: ["Selected unit was not found."] },
    };
  }

  const isNewUnit = unit.id !== existing.unitId;
  if (isNewUnit && values.mode !== "CANCEL" && !isBookableListingStatus(unit.listingStatus)) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: {
        unitNo: ["This unit is not available for booking (already booked or not on sale)."],
      },
    };
  }

  const unitBasePrice = Number(unit.basePrice ?? 0);
  if (!Number.isFinite(unitBasePrice) || unitBasePrice < 0) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { priceOfUnit: ["Selected unit has invalid base price."] },
    };
  }
  const unitTransferCharges = Number(unit.transferCharges ?? 0);
  const discountAmount = values.discountAmount ?? 0;
  const cashPayable = values.cashPayable ?? 0;
  const { grossTotal, payableCost } = calculateFinancials({
    mode: values.mode,
    unitPrice: unitBasePrice,
    unitTransferCharges,
    discountAmount,
    cashPayable,
    addonParking: values.addonParking,
    addonUtility: values.addonUtility,
    addonDocumentation: values.addonDocumentation,
    addonTax: values.addonTax,
    addonPenalty: values.addonPenalty,
    bookingTransferFee: values.bookingTransferFee,
  });

  const fieldErrors: Record<string, string[]> = {};
  if (grossTotal < 0) {
    addFieldError(fieldErrors, "discountAmount", "Discount cannot exceed unit price, transfer charges, and add-ons.");
  }
  if (payableCost < 0) {
    addFieldError(fieldErrors, "payableCost", "Payable cost cannot be negative.");
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }

  let switchToUnitId: string | null = null;
  if (values.mode === "SWITCHING" || values.mode === "TRANSFER") {
    const rawTarget = (values.switchToUnitNo ?? "").trim().toUpperCase();
    const normalizedTarget = normalizeUnitNoForStorage(values.tower, rawTarget);
    const candidates = await db.unit.findMany({
      where: {
        project: { code: values.projectCode },
        OR: [{ unitNo: rawTarget }, { unitNo: normalizedTarget }],
      },
      select: {
        id: true,
        unitNo: true,
        prefix: true,
        listingStatus: true,
        tower: { select: { code: true } },
      },
      take: 20,
    });
    const matched = candidates.find((candidate) => {
      const label = formatUnitLabel(candidate.tower.code, candidate.unitNo, candidate.prefix).toUpperCase();
      return (
        label === rawTarget ||
        candidate.unitNo.toUpperCase() === rawTarget ||
        candidate.unitNo.toUpperCase() === normalizedTarget
      );
    });
    switchToUnitId = matched?.id ?? null;
    if (!switchToUnitId) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: { switchToUnitNo: ["Target unit not found in selected project."] },
      };
    }
    if (
      switchToUnitId !== unit.id &&
      matched &&
      !isBookableListingStatus(matched.listingStatus)
    ) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: { switchToUnitNo: ["Target unit is not available for transfer or switching."] },
      };
    }
  }

  const switchingDate = values.switchingDate ? new Date(values.switchingDate) : null;
  const transferDate = values.transferDate ? new Date(values.transferDate) : null;
  const cancelDate = values.cancelDate ? new Date(values.cancelDate) : null;

  try {
    await db.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: existing.customerId },
        data: {
          fullName: values.fullName,
          fatherHusband: values.fatherHusband ?? null,
          phoneOffice: values.phoneOffice ?? null,
          phoneRes: values.phoneRes ?? null,
          whatsapp: values.whatsapp ?? null,
          phone: values.whatsapp ?? values.phoneRes ?? values.phoneOffice ?? null,
          email: values.email ?? null,
          cnic: values.cnic ?? null,
          passportNo: values.passportNo ?? null,
          nationality: values.nationality ?? null,
          postalAddress: values.postalAddress,
          income: values.income ?? null,
          age: values.age ?? null,
          occupation: values.occupation ?? null,
          broker: values.broker ?? null,
          careOf: values.careOf ?? null,
        },
      });

      const currentNominee = existing.customer.nominees[0];
      if (values.nomineeName) {
        if (currentNominee) {
          await tx.nominee.update({
            where: { id: currentNominee.id },
            data: {
              name: values.nomineeName,
              relation: values.relation ?? null,
              fatherName: values.nomineeFatherName ?? null,
              address: values.nomineeAddress ?? null,
              cnic: values.nomineeCnic ?? null,
              passportNo: values.nomineePassport ?? null,
              cell: values.nomineeCell ?? null,
            },
          });
        } else {
          await tx.nominee.create({
            data: {
              customerId: existing.customerId,
              name: values.nomineeName,
              relation: values.relation ?? null,
              fatherName: values.nomineeFatherName ?? null,
              address: values.nomineeAddress ?? null,
              cnic: values.nomineeCnic ?? null,
              passportNo: values.nomineePassport ?? null,
              cell: values.nomineeCell ?? null,
            },
          });
        }
      } else if (currentNominee) {
        await tx.nominee.delete({ where: { id: currentNominee.id } });
      }

      if (existing.unitId !== unit.id && values.mode !== "CANCEL") {
        const reserved = await tx.unit.updateMany({
          where: {
            id: unit.id,
            listingStatus: { in: [...BOOKABLE_LISTING_STATUSES] },
          },
          data: { listingStatus: "BOOKED" },
        });
        if (reserved.count !== 1) {
          throw new Error("UNIT_NOT_BOOKABLE");
        }
      }

      await tx.booking.update({
        where: { id: bookingId },
        data: {
          projectId: unit.projectId,
          unitId: unit.id,
          bookingDate,
          mode: values.mode,
          transferDate: getTransferDateForMode(values.mode, transferDate),
          switchingDate: switchingDate && !Number.isNaN(switchingDate.getTime()) ? switchingDate : null,
          switchDate: getSwitchDateForMode(values.mode, switchingDate),
          switchToUnitId,
          cancelDate: cancelDate && !Number.isNaN(cancelDate.getTime()) ? cancelDate : null,
          currentDateAtBooking: new Date(`${toDateOnly(new Date())}T00:00:00.000Z`),
          categoryAtBooking: values.category ?? null,
          unitPrice: unitBasePrice,
          cashPayable,
          discountAmount,
          grossTotal,
          payableCost,
          addonParking: values.addonParking ?? null,
          addonUtility: values.addonUtility ?? null,
          addonDocumentation: values.addonDocumentation ?? null,
          addonTax: values.addonTax ?? null,
          addonPenalty: values.addonPenalty ?? null,
          bookingTransferFee: values.bookingTransferFee ?? null,
          notes: existing.notes ?? null,
        },
      });

      if (existing.unitId !== unit.id) {
        const remaining = await tx.booking.count({
          where: {
            unitId: existing.unitId,
            status: { notIn: getClosedStatuses() },
            id: { not: bookingId },
          },
        });
        if (remaining === 0) {
          await tx.unit.update({
            where: { id: existing.unitId },
            data: { listingStatus: "AVAILABLE" },
          });
        }
      }

      if (existing.unitId !== unit.id && values.mode === "CANCEL") {
        await tx.unit.update({
          where: { id: unit.id },
          data: { listingStatus: "AVAILABLE" },
        });
      } else if (existing.unitId === unit.id) {
        await tx.unit.update({
          where: { id: unit.id },
          data: { listingStatus: values.mode === "CANCEL" ? "AVAILABLE" : "BOOKED" },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNIT_NOT_BOOKABLE") {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: {
          unitNo: ["That unit is no longer available. Choose another unit or refresh and try again."],
        },
      };
    }
    return { ok: false, message: "Unable to update booking right now. Please try again." };
  }

  return { ok: true, message: `Booking ${existing.bookingNo} updated successfully.` };
}

export async function transferBookingToNewCustomerAction(
  bookingId: string,
  payload: unknown,
): Promise<BookingFormActionState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You are not logged in." };
  }
  if (!bookingId) {
    return { ok: false, message: "Invalid booking id." };
  }

  const parsed = bookingFormSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = Object.fromEntries(
      Object.entries(flat.fieldErrors).filter(([, v]) => Array.isArray(v) && v.length > 0),
    ) as Record<string, string[]>;
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const values = parsed.data;

  const existing = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      unit: true,
      project: true,
    },
  });
  if (!existing) {
    return { ok: false, message: "Booking not found." };
  }
  if (isClosedBookingStatus(existing.status)) {
    return { ok: false, message: "This booking is already closed and cannot be transferred." };
  }

  const transferDate = values.transferDate ? new Date(values.transferDate) : new Date(values.bookingDate);
  if (Number.isNaN(transferDate.getTime())) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { transferDate: ["Valid transfer date is required."] },
    };
  }

  const unitBasePrice = Number(existing.unit.basePrice ?? existing.unitPrice ?? 0);
  const unitTransferCharges = Number(existing.unit.transferCharges ?? 0);
  const discountAmount = values.discountAmount ?? 0;
  const cashPayable = values.cashPayable ?? 0;
  const { grossTotal, payableCost } = calculateFinancials({
    mode: "TRANSFER",
    unitPrice: unitBasePrice,
    unitTransferCharges,
    discountAmount,
    cashPayable,
    addonParking: values.addonParking,
    addonUtility: values.addonUtility,
    addonDocumentation: values.addonDocumentation,
    addonTax: values.addonTax,
    addonPenalty: values.addonPenalty,
    bookingTransferFee: values.bookingTransferFee,
  });

  let newBookingNo = "";
  try {
    await db.$transaction(async (tx) => {
      const customerId = await createCustomerFromValues(tx, values);
      newBookingNo = await generateBookingNo(tx, transferDate);

      const newBooking = await tx.booking.create({
        data: {
          bookingNo: newBookingNo,
          projectId: existing.projectId,
          unitId: existing.unitId,
          previousBookingId: existing.id,
          customerId,
          bookedByUserId: session.userId,
          bookingDate: transferDate,
          mode: "TRANSFER",
          status: "CONFIRMED",
          transferDate,
          currentDateAtBooking: new Date(`${toDateOnly(new Date())}T00:00:00.000Z`),
          categoryAtBooking: values.category ?? null,
          unitPrice: unitBasePrice,
          cashPayable,
          discountAmount,
          grossTotal,
          payableCost,
          addonParking: values.addonParking ?? null,
          addonUtility: values.addonUtility ?? null,
          addonDocumentation: values.addonDocumentation ?? null,
          addonTax: values.addonTax ?? null,
          addonPenalty: values.addonPenalty ?? null,
          bookingTransferFee: values.bookingTransferFee ?? null,
          notes: null,
        },
      });

      await tx.booking.update({
        where: { id: existing.id },
        data: {
          status: "TRANSFERRED",
          transferDate,
          notes: [existing.notes, `TRANSFERRED_TO:${newBooking.bookingNo}`].filter(Boolean).join(" | "),
        },
      });

      const previousPayments = await tx.payment.findMany({
        where: { bookingId: existing.id, voidedAt: null },
      });
      const previousPaidAmount = previousPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      for (const payment of previousPayments) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            bookingId: newBooking.id,
            sourceBookingId: existing.id,
          },
        });
      }

      if (previousPaidAmount > 0) {
        await tx.companyLiability.create({
          data: {
            sourceBookingId: existing.id,
            transferBookingId: newBooking.id,
            liabilityType: "TRANSFER",
            amount: previousPaidAmount,
            reason: `Liability after transfer from booking ${existing.bookingNo}`,
            notes: "Previous owner paid amount is now company liability after transfer completion.",
          },
        });
      }

      await resetInstallmentPlanFromPreviousBooking({
        tx,
        fromBookingId: existing.id,
        toBookingId: newBooking.id,
        startDate: transferDate,
      });
    });
  } catch {
    return { ok: false, message: "Unable to complete transfer right now. Please try again." };
  }

  return { ok: true, message: `Transfer completed. New booking ${newBookingNo} created.` };
}

export async function switchBookingToNewUnitAction(
  bookingId: string,
  payload: unknown,
): Promise<BookingFormActionState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You are not logged in." };
  }
  if (!bookingId) {
    return { ok: false, message: "Invalid booking id." };
  }

  const parsed = bookingFormSchema.safeParse(payload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors = Object.fromEntries(
      Object.entries(flat.fieldErrors).filter(([, v]) => Array.isArray(v) && v.length > 0),
    ) as Record<string, string[]>;
    return { ok: false, message: "Please fix the highlighted fields.", fieldErrors };
  }
  const values = parsed.data;
  const rawTarget = (values.switchToUnitNo ?? "").trim().toUpperCase();

  const existing = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      unit: { include: { tower: true } },
    },
  });
  if (!existing) {
    return { ok: false, message: "Booking not found." };
  }
  if (isClosedBookingStatus(existing.status)) {
    return { ok: false, message: "This booking is already closed and cannot be switched." };
  }

  const normalizedTarget = normalizeUnitNoForStorage(existing.unit.tower.code, rawTarget);
  const candidates = await db.unit.findMany({
    where: {
      projectId: existing.projectId,
      OR: [{ unitNo: rawTarget }, { unitNo: normalizedTarget }],
    },
    select: {
      id: true,
      unitNo: true,
      prefix: true,
      projectId: true,
      listingStatus: true,
      tower: { select: { code: true } },
    },
    take: 20,
  });
  const targetUnit = candidates.find((candidate) => {
    const label = formatUnitLabel(candidate.tower.code, candidate.unitNo, candidate.prefix).toUpperCase();
    return label === rawTarget || candidate.unitNo.toUpperCase() === rawTarget || candidate.unitNo.toUpperCase() === normalizedTarget;
  });

  if (!targetUnit) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { switchToUnitNo: ["Target unit not found in selected project."] },
    };
  }
  if (targetUnit.id === existing.unitId) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { switchToUnitNo: ["Switch target must be different from current unit."] },
    };
  }
  if (!isBookableListingStatus(targetUnit.listingStatus)) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { switchToUnitNo: ["Target unit is not available for switching."] },
    };
  }

  const switchDate = values.switchingDate ? new Date(values.switchingDate) : new Date(values.bookingDate);
  if (Number.isNaN(switchDate.getTime())) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: { switchingDate: ["Valid switch date is required."] },
    };
  }

  let newBookingNo = "";
  try {
    await db.$transaction(async (tx) => {
      const reserveTarget = await tx.unit.updateMany({
        where: {
          id: targetUnit.id,
          listingStatus: { in: [...BOOKABLE_LISTING_STATUSES] },
        },
        data: { listingStatus: "BOOKED" },
      });
      if (reserveTarget.count !== 1) {
        throw new Error("UNIT_NOT_BOOKABLE");
      }

      const customerId = await createCustomerFromValues(tx, values);
      const unitBasePrice = Number(existing.unit.basePrice ?? existing.unitPrice ?? 0);
      const unitTransferCharges = Number(existing.unit.transferCharges ?? 0);
      const discountAmount = values.discountAmount ?? 0;
      const cashPayable = values.cashPayable ?? 0;
      const { grossTotal, payableCost } = calculateFinancials({
        mode: "SWITCHING",
        unitPrice: unitBasePrice,
        unitTransferCharges,
        discountAmount,
        cashPayable,
        addonParking: values.addonParking,
        addonUtility: values.addonUtility,
        addonDocumentation: values.addonDocumentation,
        addonTax: values.addonTax,
        addonPenalty: values.addonPenalty,
        bookingTransferFee: values.bookingTransferFee,
      });
      newBookingNo = await generateBookingNo(tx, switchDate);

      const switchedBooking = await tx.booking.create({
        data: {
          bookingNo: newBookingNo,
          projectId: targetUnit.projectId,
          unitId: targetUnit.id,
          previousBookingId: existing.id,
          customerId,
          bookedByUserId: session.userId,
          bookingDate: switchDate,
          mode: "SWITCHING",
          status: "DRAFT",
          switchingDate: switchDate,
          switchDate,
          currentDateAtBooking: new Date(`${toDateOnly(new Date())}T00:00:00.000Z`),
          categoryAtBooking: values.category ?? null,
          unitPrice: unitBasePrice,
          cashPayable,
          discountAmount,
          grossTotal,
          payableCost,
          addonParking: values.addonParking ?? null,
          addonUtility: values.addonUtility ?? null,
          addonDocumentation: values.addonDocumentation ?? null,
          addonTax: values.addonTax ?? null,
          addonPenalty: values.addonPenalty ?? null,
          bookingTransferFee: values.bookingTransferFee ?? null,
          notes: null,
        },
      });

      await tx.booking.update({
        where: { id: existing.id },
        data: {
          status: "SWITCHED",
          switchingDate: switchDate,
          switchDate,
          switchToUnitId: targetUnit.id,
          notes: [existing.notes, `SWITCHED_TO:${switchedBooking.bookingNo}`].filter(Boolean).join(" | "),
        },
      });

      const remainingOnOld = await tx.booking.count({
        where: {
          unitId: existing.unitId,
          status: { notIn: getClosedStatuses() },
          id: { not: existing.id },
        },
      });
      if (remainingOnOld === 0) {
        await tx.unit.update({
          where: { id: existing.unitId },
          data: { listingStatus: "AVAILABLE" },
        });
      }

      await resetInstallmentPlanFromPreviousBooking({
        tx,
        fromBookingId: existing.id,
        toBookingId: switchedBooking.id,
        startDate: switchDate,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNIT_NOT_BOOKABLE") {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: { switchToUnitNo: ["Target unit was just booked by someone else. Choose another unit."] },
      };
    }
    return { ok: false, message: "Unable to complete switch right now. Please try again." };
  }

  return { ok: true, message: `Switch completed. New booking ${newBookingNo} created.` };
}

const mergeBookingsSchema = z.object({
  sourceBookingId: z.string().min(1),
  targetBookingId: z.string().min(1),
  mergeDate: z.string().min(1),
  notes: z.string().max(1000).optional().nullable(),
});

const cancelWithLiabilitySchema = z.object({
  cancelDate: z.string().min(1),
  liabilityAmount: z.coerce.number().min(0),
  penaltyDeduction: z.coerce.number().min(0).optional().default(0),
  notes: z.string().max(1000).optional().nullable(),
});

function sumDecimalFields(...values: (number | null | undefined)[]) {
  return values.reduce<number>((sum, v) => sum + Number(v ?? 0), 0);
}

export async function mergeBookingsAction(payload: unknown): Promise<BookingMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You are not logged in." };
  }

  const parsed = mergeBookingsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "Invalid merge request." };
  }

  const { sourceBookingId, targetBookingId, mergeDate: mergeDateStr, notes } = parsed.data;
  if (sourceBookingId === targetBookingId) {
    return { ok: false, message: "Source and target bookings must be different." };
  }

  const mergeDate = new Date(`${mergeDateStr}T12:00:00`);
  if (Number.isNaN(mergeDate.getTime())) {
    return { ok: false, message: "Invalid merge date." };
  }

  const [source, target] = await Promise.all([
    db.booking.findUnique({
      where: { id: sourceBookingId },
      include: { unit: true, plan: { include: { schedules: { orderBy: { installmentNo: "asc" } } } } },
    }),
    db.booking.findUnique({
      where: { id: targetBookingId },
      include: { unit: true, plan: { include: { schedules: { orderBy: { installmentNo: "asc" } } } } },
    }),
  ]);

  if (!source || !target) {
    return { ok: false, message: "One or both bookings were not found." };
  }
  if (source.customerId !== target.customerId) {
    return { ok: false, message: "Both bookings must belong to the same customer." };
  }
  if (isClosedBookingStatus(source.status) || isClosedBookingStatus(target.status)) {
    return { ok: false, message: "Closed bookings cannot be merged." };
  }

  try {
    await db.$transaction(async (tx) => {
      const combinedPayable =
        Number(target.payableCost ?? 0) + Number(source.payableCost ?? 0);
      const combinedGross = Number(target.grossTotal ?? 0) + Number(source.grossTotal ?? 0);

      await tx.booking.update({
        where: { id: target.id },
        data: {
          mode: "MERGE",
          payableCost: combinedPayable,
          grossTotal: combinedGross,
          unitPrice: sumDecimalFields(Number(target.unitPrice), Number(source.unitPrice)),
          cashPayable: sumDecimalFields(Number(target.cashPayable), Number(source.cashPayable)),
          discountAmount: sumDecimalFields(Number(target.discountAmount), Number(source.discountAmount)),
          addonParking: sumDecimalFields(Number(target.addonParking), Number(source.addonParking)),
          addonUtility: sumDecimalFields(Number(target.addonUtility), Number(source.addonUtility)),
          addonDocumentation: sumDecimalFields(Number(target.addonDocumentation), Number(source.addonDocumentation)),
          addonTax: sumDecimalFields(Number(target.addonTax), Number(source.addonTax)),
          addonPenalty: sumDecimalFields(Number(target.addonPenalty), Number(source.addonPenalty)),
          bookingTransferFee: sumDecimalFields(Number(target.bookingTransferFee), Number(source.bookingTransferFee)),
          notes: [target.notes, `MERGED_FROM:${source.bookingNo}`, notes?.trim()].filter(Boolean).join(" | "),
        },
      });

      const sourcePayments = await tx.payment.findMany({
        where: { bookingId: source.id, voidedAt: null },
      });
      for (const payment of sourcePayments) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            bookingId: target.id,
            sourceBookingId: source.id,
          },
        });
      }

      const sourceSchedules = source.plan?.schedules ?? [];
      const targetSchedules = target.plan?.schedules ?? [];
      const mergedRows = [...targetSchedules, ...sourceSchedules].slice(0, MAX_INSTALLMENTS);

      if (mergedRows.length > 0) {
        assertInstallmentCount(mergedRows.length);
        const totalAmount = mergedRows.reduce((sum, row) => sum + Number(row.dueAmount), 0);

        if (target.plan) {
          await tx.paymentInstallment.deleteMany({ where: { paymentPlanId: target.plan.id } });
          await tx.paymentPlan.update({
            where: { id: target.plan.id },
            data: {
              planName: `${target.plan.planName} (Merged)`,
              totalInstallments: mergedRows.length,
              startDate: mergeDate,
              totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
            },
          });

          for (let i = 0; i < mergedRows.length; i += 1) {
            const row = mergedRows[i];
            const dueDate = new Date(mergeDate);
            dueDate.setMonth(dueDate.getMonth() + i);
            await tx.paymentInstallment.create({
              data: {
                paymentPlanId: target.plan.id,
                installmentNo: i + 1,
                dueDate,
                dueAmount: row.dueAmount,
                status: row.status,
              },
            });
          }
        } else {
          const plan = await tx.paymentPlan.create({
            data: {
              bookingId: target.id,
              planName: `Merged plan — ${target.bookingNo}`,
              totalInstallments: mergedRows.length,
              startDate: mergeDate,
              totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
            },
          });
          for (let i = 0; i < mergedRows.length; i += 1) {
            const row = mergedRows[i];
            const dueDate = new Date(mergeDate);
            dueDate.setMonth(dueDate.getMonth() + i);
            await tx.paymentInstallment.create({
              data: {
                paymentPlanId: plan.id,
                installmentNo: i + 1,
                dueDate,
                dueAmount: row.dueAmount,
                status: row.status,
              },
            });
          }
        }
      }

      await tx.booking.update({
        where: { id: source.id },
        data: {
          status: "MERGED",
          mode: "MERGE",
          mergedIntoBookingId: target.id,
          notes: [source.notes, `MERGED_INTO:${target.bookingNo}`].filter(Boolean).join(" | "),
        },
      });

      await tx.bookingMerge.create({
        data: {
          targetBookingId: target.id,
          sourceBookingId: source.id,
          mergedAt: mergeDate,
          mergedByUserId: session.userId,
          notes: notes?.trim() || null,
        },
      });

      const otherOnSourceUnit = await tx.booking.count({
        where: {
          unitId: source.unitId,
          status: { notIn: getClosedStatuses() },
          id: { not: source.id },
        },
      });
      if (otherOnSourceUnit === 0) {
        await tx.unit.update({
          where: { id: source.unitId },
          data: { listingStatus: "AVAILABLE" },
        });
      }
    });
  } catch (e) {
    console.error(e);
    return { ok: false, message: "Unable to merge bookings." };
  }

  return { ok: true, message: `Bookings merged. ${source.bookingNo} absorbed into ${target.bookingNo}.` };
}

export async function cancelBookingWithLiabilityAction(
  bookingId: string,
  payload: unknown,
): Promise<BookingMutationState> {
  const session = await getCurrentSession();
  if (!session?.userId) {
    return { ok: false, message: "You are not logged in." };
  }

  const parsed = cancelWithLiabilitySchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "Invalid cancellation data." };
  }

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { unit: true },
  });
  if (!booking) {
    return { ok: false, message: "Booking not found." };
  }
  if (isClosedBookingStatus(booking.status)) {
    return { ok: false, message: "This booking is already closed." };
  }

  const cancelDate = new Date(`${parsed.data.cancelDate}T12:00:00`);
  if (Number.isNaN(cancelDate.getTime())) {
    return { ok: false, message: "Invalid cancel date." };
  }

  const paidAgg = await db.payment.aggregate({
    where: { bookingId, voidedAt: null },
    _sum: { amount: true },
  });
  const totalPaid = Number(paidAgg._sum.amount ?? 0);
  const liabilityAmount = parsed.data.liabilityAmount;
  const penalty = parsed.data.penaltyDeduction ?? 0;

  if (liabilityAmount > totalPaid + 0.01) {
    return { ok: false, message: "Liability cannot exceed total amount paid on this booking." };
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          mode: "CANCEL",
          cancelDate,
          notes: [booking.notes, parsed.data.notes?.trim(), `PENALTY:${penalty}`].filter(Boolean).join(" | "),
        },
      });

      const otherActive = await tx.booking.count({
        where: {
          unitId: booking.unitId,
          status: { notIn: getClosedStatuses() },
          id: { not: bookingId },
        },
      });
      if (otherActive === 0) {
        await tx.unit.update({
          where: { id: booking.unitId },
          data: { listingStatus: "AVAILABLE" },
        });
      }

      if (liabilityAmount > 0) {
        await tx.companyLiability.create({
          data: {
            sourceBookingId: bookingId,
            liabilityType: "CANCELLATION",
            amount: liabilityAmount,
            reason: `FM Towers liability after cancellation of ${booking.bookingNo}`,
            notes: [
              `Total paid: ${totalPaid.toFixed(2)}`,
              penalty > 0 ? `Penalty deducted: ${penalty.toFixed(2)}` : null,
              parsed.data.notes?.trim() ?? null,
            ]
              .filter(Boolean)
              .join(" | "),
          },
        });
      }
    });
  } catch {
    return { ok: false, message: "Unable to cancel booking." };
  }

  return { ok: true, message: `Booking ${booking.bookingNo} cancelled.` };
}
