/** Pakistan NADRA-style CNIC: up to 13 digits → XXXXX-XXXXXXX-X */
export function formatCnicInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/** Digits-only CNIC search: avoid treating booking codes like "A-12" as CNIC. */
export function formatBookingSearchInput(raw: string): string {
  const trimmed = raw;
  if (/[a-zA-Z\u0600-\u06FF]/.test(trimmed)) return trimmed;
  if (/^[-\d\s]*$/.test(trimmed)) {
    return formatCnicInput(trimmed.replace(/\s/g, ""));
  }
  return trimmed;
}
