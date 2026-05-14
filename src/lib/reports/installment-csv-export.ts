import type { CustomerInstallmentSummaryRow } from "@/lib/reports/installment-report-filters";
import type { InstallmentScheduleRow } from "@/lib/reports/installment-schedule-row";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCsvAmount(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function buildInstallmentScheduleCsv(rows: InstallmentScheduleRow[]): string {
  const headers = [
    "booking_no",
    "booking_status",
    "unit_status",
    "project_code",
    "unit_label",
    "customer_name",
    "customer_cnic",
    "plan_name",
    "installment_no",
    "due_date",
    "due_amount_pkr",
    "paid_amount_pkr",
    "balance_pkr",
    "installment_status",
  ];
  const lines = rows.map((r) =>
    [
      r.bookingNo,
      r.bookingStatus,
      r.unitStatus,
      r.projectCode,
      r.unitLabel,
      r.customerName,
      r.customerCnic,
      r.planName,
      r.installmentNo,
      r.dueDate,
      formatCsvAmount(r.dueAmount),
      formatCsvAmount(r.paidAmount),
      formatCsvAmount(r.balance),
      r.status,
    ]
      .map(csvEscape)
      .join(","),
  );
  return `\uFEFF${[headers.join(","), ...lines].join("\r\n")}\r\n`;
}

export function buildCustomerSummaryCsv(rows: CustomerInstallmentSummaryRow[]): string {
  const headers = [
    "customer_name",
    "customer_cnic",
    "bookings_in_scope",
    "installment_lines",
    "total_due_pkr",
    "total_paid_pkr",
    "total_balance_pkr",
  ];
  const lines = rows.map((r) =>
    [
      r.customerName,
      r.customerCnic,
      r.bookingCount,
      r.installmentCount,
      formatCsvAmount(r.totalDue),
      formatCsvAmount(r.totalPaid),
      formatCsvAmount(r.totalBalance),
    ]
      .map(csvEscape)
      .join(","),
  );
  return `\uFEFF${[headers.join(","), ...lines].join("\r\n")}\r\n`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
