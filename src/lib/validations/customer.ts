import { z } from "zod";
import {
  optionalAddress,
  optionalCnic,
  optionalEmail,
  optionalInt,
  optionalNonNegativeNumber,
  optionalPersonName,
  optionalPhone,
  requiredPersonName,
} from "@/lib/validations/common";

/** Payload for PATCH /api/customers/[id] */
export const customerUpdateSchema = z.object({
  fullName: requiredPersonName("Full name"),
  fatherHusband: optionalPersonName("Father / husband"),
  phone: optionalPhone,
  phoneOffice: optionalPhone,
  phoneRes: optionalPhone,
  whatsapp: optionalPhone,
  email: optionalEmail,
  cnic: optionalCnic,
  passportNo: z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().toUpperCase()))
    .refine((v) => v === undefined || /^[A-Z0-9]{5,24}$/.test(v), "Invalid passport"),
  nationality: z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
    .refine((v) => v === undefined || v.length <= 64, "Max 64 characters"),
  postalAddress: optionalAddress("Address", 500),
  income: optionalNonNegativeNumber("Income"),
  age: optionalInt("Age", 1, 120),
  occupation: z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
    .refine((v) => v === undefined || v.length <= 120, "Max 120 characters"),
  broker: z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
    .refine((v) => v === undefined || v.length <= 200, "Max 200 characters"),
  careOf: z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim()))
    .refine((v) => v === undefined || v.length <= 200, "Max 200 characters"),
});

export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
