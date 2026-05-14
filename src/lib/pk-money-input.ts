/** Display / parse PK-style money in schedule inputs (grouping while idle; plain while editing). */

const DISPLAY = new Intl.NumberFormat("en-PK", {
  useGrouping: true,
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatPkContractNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Intl.NumberFormat("en-PK", {
    useGrouping: true,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(n));
}

export function formatPkAmountDisplay(n: number): string {
  if (!Number.isFinite(n)) return "";
  return DISPLAY.format(n);
}

/** Strip grouping; keep digits, one dot, leading minus. */
export function parsePkAmountInput(raw: string): number {
  const cleaned = raw.replace(/[,，\s]/g, "").replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return Number.NaN;
  const v = Number.parseFloat(cleaned);
  return Number.isFinite(v) ? v : Number.NaN;
}

export function normalizePkAmountOnBlur(raw: string, fallback: number): number {
  const v = parsePkAmountInput(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.round(v * 100) / 100;
}

/** Plain text while editing (no commas). */
export function formatPkAmountPlain(n: number): string {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded));
  return String(rounded);
}
