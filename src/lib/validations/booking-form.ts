import { z } from "zod";
import {
  optionalAddress,
  optionalCnic,
  optionalEmail,
  optionalInt,
  optionalNonNegativeNumber,
  optionalPersonName,
  optionalPhone,
  requiredAddress,
  requiredPersonName,
  requiredText,
} from "@/lib/validations/common";

export const bookingModeEnum = z.enum(["REGULAR", "TRANSFER", "CANCEL", "SWITCHING", "GIFT", "MERGE"]);

export const bookingFormSchema = z
  .object({
    bookingDate: z
      .string()
      .min(1, "Booking date is required")
      .refine((v) => !Number.isNaN(new Date(v).getTime()), "Invalid booking date"),
    mode: bookingModeEnum,
    transferDate: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim())),
    switchingDate: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim())),
    switchToUnitNo: z
      .string()
      .optional()
      .transform((v) => (v == null ? "" : v.trim())),
    cancelDate: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim())),

    projectCode: requiredText("Project", 64),
    unitNo: requiredText("Unit number", 32),
    tower: requiredText("Tower", 8),
    floorNo: z
      .union([z.string(), z.number()])
      .transform((raw) => {
        const value = typeof raw === "number" ? String(raw) : raw.trim();
        if (!value) return Number.NaN;
        if (!/^\d{1,3}$/.test(value)) return Number.NaN;
        return Number.parseInt(value, 10);
      })
      .refine((n) => Number.isInteger(n) && n >= 0 && n <= 200, "Floor must be a number (e.g. 1-120)"),
    category: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().toUpperCase()))
      .refine((v) => v === undefined || v.length <= 32, "Category is too long"),
    unitType: z.enum(["RESIDENTIAL", "COMMERCIAL", "PENTHOUSE"], {
      message: "Select unit type",
    }),
    size: z
      .union([z.string(), z.number()])
      .transform((raw) => {
        const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
        return Number.isFinite(n) ? n : Number.NaN;
      })
      .refine((n) => Number.isFinite(n) && n > 0 && n <= 1_000_000, {
        message: "Enter size in sq ft (positive number)",
      }),
    rooms: optionalInt("Rooms", 0, 20),
    facing: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
      .refine((v) => v === undefined || v.length <= 64, "Facing is too long"),

    fullName: requiredPersonName("Applicant name", 200),
    fatherHusband: optionalPersonName("Father / husband name", 200),
    postalAddress: requiredAddress("Postal address", 500),
    phoneOffice: optionalPhone,
    phoneRes: optionalPhone,
    whatsapp: optionalPhone,
    email: optionalEmail,
    income: optionalNonNegativeNumber("Income"),
    age: optionalInt("Age", 1, 120),
    nationality: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
      .refine((v) => v === undefined || v.length <= 64, "Too long"),
    cnic: optionalCnic,
    passportNo: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().toUpperCase()))
      .refine((v) => v === undefined || /^[A-Z0-9]{6,20}$/.test(v), "Invalid passport format"),
    occupation: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
      .refine((v) => v === undefined || v.length <= 120, "Too long"),
    broker: optionalPersonName("Broker name", 200),
    careOf: optionalPersonName("Care of", 200),

    nomineeName: optionalPersonName("Nominee name", 200),
    relation: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
      .refine((v) => v === undefined || v.length <= 64, "Too long"),
    nomineeFatherName: optionalPersonName("Nominee father name", 200),
    nomineeAddress: optionalAddress("Nominee address", 500),
    nomineeCnic: optionalCnic,
    nomineePassport: z
      .string()
      .optional()
      .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().toUpperCase()))
      .refine((v) => v === undefined || /^[A-Z0-9]{6,20}$/.test(v), "Invalid passport format"),
    nomineeCell: optionalPhone,

    priceOfUnit: optionalNonNegativeNumber("Price of unit"),
    cashPayable: optionalNonNegativeNumber("Cash payable"),
    discountAmount: optionalNonNegativeNumber("Discount"),
    transferCharges: optionalNonNegativeNumber("Transfer charges"),
    addonParking: optionalNonNegativeNumber("Parking add-on"),
    addonUtility: optionalNonNegativeNumber("Utility add-on"),
    addonDocumentation: optionalNonNegativeNumber("Documentation add-on"),
    addonTax: optionalNonNegativeNumber("Tax add-on"),
    addonPenalty: optionalNonNegativeNumber("Penalty"),
    bookingTransferFee: optionalNonNegativeNumber("Booking transfer fee"),
    expectedLoan: optionalNonNegativeNumber("Expected loan"),
    grossTotal: optionalNonNegativeNumber("Gross total"),
    payableCost: optionalNonNegativeNumber("Payable cost"),
  })
  .superRefine((data, ctx) => {
    const bookingDate = new Date(data.bookingDate);
    if (data.mode === "SWITCHING") {
      if (!data.switchToUnitNo || data.switchToUnitNo.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["switchToUnitNo"],
          message: "Target unit is required for switching",
        });
      }
      if (!data.switchingDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["switchingDate"],
          message: "Switching date is required for transfer / switching",
        });
      } else {
        const switchDate = new Date(data.switchingDate);
        if (Number.isNaN(switchDate.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["switchingDate"],
            message: "Invalid switching date",
          });
        } else if (!Number.isNaN(bookingDate.getTime()) && switchDate < bookingDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["switchingDate"],
            message: "Switching date cannot be before booking date",
          });
        }
      }
    }
    if (data.mode === "TRANSFER") {
      if (!data.transferDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transferDate"],
          message: "Transfer date is required",
        });
      } else {
        const transferDate = new Date(data.transferDate);
        if (Number.isNaN(transferDate.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["transferDate"],
            message: "Invalid transfer date",
          });
        } else if (!Number.isNaN(bookingDate.getTime()) && transferDate < bookingDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["transferDate"],
            message: "Transfer date cannot be before booking date",
          });
        }
      }
    }
    if (data.mode === "CANCEL") {
      if (!data.cancelDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["cancelDate"],
          message: "Cancellation date is required",
        });
      } else {
        const cancelDate = new Date(data.cancelDate);
        if (Number.isNaN(cancelDate.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["cancelDate"],
            message: "Invalid cancellation date",
          });
        } else if (!Number.isNaN(bookingDate.getTime()) && cancelDate < bookingDate) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["cancelDate"],
            message: "Cancellation date cannot be before booking date",
          });
        }
      }
    }
    const hasNominee =
      !!data.nomineeName ||
      !!data.relation ||
      !!data.nomineeFatherName ||
      !!data.nomineeAddress ||
      !!data.nomineeCnic ||
      !!data.nomineePassport ||
      !!data.nomineeCell;
    if (hasNominee) {
      if (!data.nomineeName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nomineeName"],
          message: "Nominee name is required when nominee details are filled",
        });
      }
    }

    const unitPrice = data.priceOfUnit ?? 0;
    const discount = data.discountAmount ?? 0;
    const transfer = data.mode === "TRANSFER" ? (data.transferCharges ?? 0) : 0;
    const addonSum =
      (data.addonParking ?? 0) +
      (data.addonUtility ?? 0) +
      (data.addonDocumentation ?? 0) +
      (data.addonTax ?? 0) +
      (data.addonPenalty ?? 0) +
      (data.bookingTransferFee ?? 0);
    const gross = unitPrice + transfer + addonSum - discount;

    if (gross < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountAmount"],
        message: "Discount cannot exceed unit price, transfer charges, and add-ons.",
      });
    }

    const cashPayable = data.cashPayable ?? 0;
    const payable = gross + cashPayable;
    if (payable < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payableCost"],
        message: "Payable cost cannot be negative.",
      });
    }
  });

/** Parsed + normalized shape after Zod transforms */
export type BookingFormValues = z.infer<typeof bookingFormSchema>;

/** Raw form shape (strings from inputs) — use with `react-hook-form` */
export type BookingFormInput = z.input<typeof bookingFormSchema>;
