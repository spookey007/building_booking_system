import type { InstallmentScheduleRow } from "@/lib/reports/installment-schedule-row";

export type CustomerInstallmentSummaryRow = {
  customerKey: string;
  customerName: string;
  customerCnic: string;
  bookingCount: number;
  installmentCount: number;
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
};

/** Inclusive due-date filter on YYYY-MM-DD strings. Empty bound = open. */
export function filterInstallmentsByDueDateRange(
  rows: InstallmentScheduleRow[],
  dueFrom: string,
  dueTo: string,
): InstallmentScheduleRow[] {
  return rows.filter((r) => {
    if (dueFrom && r.dueDate < dueFrom) return false;
    if (dueTo && r.dueDate > dueTo) return false;
    return true;
  });
}

export function summarizeInstallmentsByCustomer(rows: InstallmentScheduleRow[]): CustomerInstallmentSummaryRow[] {
  const map = new Map<
    string,
    {
      customerName: string;
      customerCnic: string;
      bookingIds: Set<string>;
      installmentCount: number;
      totalDue: number;
      totalPaid: number;
      totalBalance: number;
    }
  >();

  for (const r of rows) {
    const key = `${(r.customerCnic || "").trim()}|${r.customerName.trim()}`;
    const cur = map.get(key) ?? {
      customerName: r.customerName,
      customerCnic: r.customerCnic ?? "",
      bookingIds: new Set<string>(),
      installmentCount: 0,
      totalDue: 0,
      totalPaid: 0,
      totalBalance: 0,
    };
    cur.bookingIds.add(r.bookingId);
    cur.installmentCount += 1;
    cur.totalDue += r.dueAmount;
    cur.totalPaid += r.paidAmount;
    cur.totalBalance += r.balance;
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .map(([customerKey, v]) => ({
      customerKey,
      customerName: v.customerName,
      customerCnic: v.customerCnic,
      bookingCount: v.bookingIds.size,
      installmentCount: v.installmentCount,
      totalDue: v.totalDue,
      totalPaid: v.totalPaid,
      totalBalance: v.totalBalance,
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "en"));
}

/** Detailed view: customer primary, then booking, then due date. */
export function sortDetailedByCustomerThenDue(rows: InstallmentScheduleRow[]): InstallmentScheduleRow[] {
  return [...rows].sort((a, b) => {
    const c = a.customerName.localeCompare(b.customerName, "en");
    if (c !== 0) return c;
    const cn = (a.customerCnic || "").localeCompare(b.customerCnic || "", "en");
    if (cn !== 0) return cn;
    const bn = a.bookingNo.localeCompare(b.bookingNo, "en");
    if (bn !== 0) return bn;
    const d = a.dueDate.localeCompare(b.dueDate);
    if (d !== 0) return d;
    return a.installmentNo - b.installmentNo;
  });
}

export function dueDateBounds(rows: InstallmentScheduleRow[]): { min: string; max: string } {
  if (rows.length === 0) return { min: "", max: "" };
  let min = rows[0].dueDate;
  let max = rows[0].dueDate;
  for (const r of rows) {
    if (r.dueDate < min) min = r.dueDate;
    if (r.dueDate > max) max = r.dueDate;
  }
  return { min, max };
}
