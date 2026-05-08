import { z } from "zod";

/** Pakistan CNIC: 12345-1234567-1 */
export const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
const personNameRegex = /^[\p{L}][\p{L}\s.'-]{1,199}$/u;

export const optionalCnic = z
  .string()
  .optional()
  .transform((v) => {
    if (v == null || v.trim() === "") return undefined;
    const raw = v.trim();
    if (/^\d{13}$/.test(raw)) {
      return `${raw.slice(0, 5)}-${raw.slice(5, 12)}-${raw.slice(12)}`;
    }
    return raw;
  })
  .refine((v) => v === undefined || cnicRegex.test(v), "Use format 12345-1234567-1");

export const optionalPhone = z
  .string()
  .optional()
  .transform((v) => {
    if (v == null || v.trim() === "") return undefined;
    return v.trim().replace(/[\s\-()]/g, "");
  })
  .refine(
    (v) => v === undefined || /^\+?\d+$/.test(v),
    "Enter a valid phone number",
  );

export const optionalEmail = z
  .string()
  .optional()
  .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().toLowerCase()))
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, "Invalid email");

/** Non-empty string from inputs; trims whitespace */
export const requiredText = (label: string, max = 200) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, `${label} is required`).max(max, `Max ${max} characters`));

export const requiredPersonName = (label: string, max = 200) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, `${label} is required`)
        .max(max, `Max ${max} characters`)
        .refine((v) => personNameRegex.test(v), `${label} contains invalid characters`),
    );

export const optionalPersonName = (label: string, max = 200) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().replace(/\s+/g, " ")))
    .refine(
      (v) => v === undefined || (v.length >= 2 && v.length <= max && personNameRegex.test(v)),
      `${label} contains invalid characters`,
    );

export const requiredAddress = (label: string, max = 500) =>
  z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, `${label} is required`)
        .refine((v) => v.length >= 8, `${label} is too short`)
        .max(max, `Max ${max} characters`)
        .refine((v) => /[\p{L}\d]/u.test(v), `${label} must contain letters or numbers`),
    );

export const optionalAddress = (label: string, max = 500) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v.trim() === "" ? undefined : v.trim().replace(/\s+/g, " ")))
    .refine(
      (v) => v === undefined || (v.length >= 8 && v.length <= max && /[\p{L}\d]/u.test(v)),
      `${label} is invalid`,
    );

/** Money / area: empty → undefined, else non‑negative finite number */
export const optionalNonNegativeNumber = (label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((raw) => {
      if (raw === "" || raw === undefined || raw === null) return undefined;
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .refine((n) => n === undefined || (Number.isFinite(n) && n >= 0), {
      message: `${label} must be zero or a positive number`,
    });

export const optionalInt = (label: string, min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((raw) => {
      if (raw === "" || raw === undefined || raw === null) return undefined;
      const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
      return Number.isFinite(n) ? n : Number.NaN;
    })
    .refine((n) => n === undefined || (Number.isInteger(n) && n >= min && n <= max), {
      message: `${label} must be between ${min} and ${max}`,
    });
