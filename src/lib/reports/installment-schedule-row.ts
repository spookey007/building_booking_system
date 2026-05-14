/** One row per payment installment for the installment schedule report (live DB). */
export type InstallmentScheduleRow = {
  installmentId: string;
  bookingId: string;
  bookingNo: string;
  bookingStatus: string;
  unitStatus: string;
  projectCode: string;
  unitLabel: string;
  customerName: string;
  customerCnic: string;
  planName: string;
  installmentNo: number;
  dueDate: string;
  dueAmount: number;
  paidAmount: number;
  balance: number;
  /** Effective status for display (past-due unpaid → OVERDUE). */
  status: string;
};

export type InstallmentScheduleSummary = {
  rowCount: number;
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
  byStatus: Record<string, number>;
};

export function buildInstallmentScheduleSummary(rows: InstallmentScheduleRow[]): InstallmentScheduleSummary {
  const byStatus: Record<string, number> = {};
  let totalDue = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    totalDue += r.dueAmount;
    totalPaid += r.paidAmount;
    totalBalance += r.balance;
  }
  return {
    rowCount: rows.length,
    totalDue,
    totalPaid,
    totalBalance,
    byStatus,
  };
}
