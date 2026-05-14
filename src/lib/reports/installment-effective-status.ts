const MONEY_EPS = 0.005;

/** Align UI status with collection reality (paid balance, calendar overdue). */
export function effectiveInstallmentStatus(dbStatus: string, dueDate: Date, balance: number): string {
  if (dbStatus === "PAID" || dbStatus === "PARTIAL") return dbStatus;
  if (balance <= MONEY_EPS) return "PAID";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(dueDate);
  d.setHours(0, 0, 0, 0);
  if (d < now) return "OVERDUE";
  return "PENDING";
}
