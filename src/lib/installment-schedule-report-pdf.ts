import type { CustomerInstallmentSummaryRow } from "@/lib/reports/installment-report-filters";
import type { InstallmentScheduleRow } from "@/lib/reports/installment-schedule-row";

import { drawFmReportPdfHeader, formatPkrPdf } from "@/lib/reports/report-pdf-header";

function tableBottomY(doc: object): number {
  const t = doc as { lastAutoTable?: { finalY: number } };
  return t.lastAutoTable?.finalY ?? 40;
}

function formatDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" });
}

export async function downloadInstallmentScheduleReportPdf(
  rows: InstallmentScheduleRow[],
  opts?: { title?: string; filterLabel?: string },
): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const title = opts?.title ?? "Installment schedule — all bookings";
  const filterLine = opts?.filterLabel?.trim() ? opts.filterLabel.trim() : "All rows in current view";

  const totalDue = rows.reduce((a, r) => a + r.dueAmount, 0);
  const totalPaid = rows.reduce((a, r) => a + r.paidAmount, 0);
  const totalBal = rows.reduce((a, r) => a + r.balance, 0);

  const startY = drawFmReportPdfHeader(doc, {
    title,
    subtitle: filterLine,
    metaRight: `${rows.length} row(s)`,
  });

  autoTable(doc, {
    startY,
    head: [["Booking", "Status", "Customer", "CNIC", "Unit", "Plan", "#", "Due date", "Due", "Paid", "Balance", "Inst."]],
    body: rows.map((r) => [
      r.bookingNo,
      r.bookingStatus,
      r.customerName.length > 28 ? `${r.customerName.slice(0, 26)}…` : r.customerName,
      r.customerCnic || "—",
      r.unitLabel,
      r.planName.length > 22 ? `${r.planName.slice(0, 20)}…` : r.planName,
      String(r.installmentNo),
      formatDate(r.dueDate),
      formatPkrPdf(r.dueAmount),
      formatPkrPdf(r.paidAmount),
      formatPkrPdf(r.balance),
      r.status,
    ]),
    theme: "striped",
    headStyles: {
      fillColor: [79, 70, 229],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: 1.4,
    },
    styles: { fontSize: 7.2, cellPadding: 1.2, textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 34 },
      3: { cellWidth: 28 },
      4: { cellWidth: 22 },
      5: { cellWidth: 28 },
      6: { cellWidth: 8, halign: "center" },
      7: { cellWidth: 24 },
      8: { cellWidth: 22, halign: "right" },
      9: { cellWidth: 22, halign: "right" },
      10: { cellWidth: 22, halign: "right" },
      11: { cellWidth: 18, halign: "center" },
    },
    margin: { left: margin, right: margin },
    showHead: "everyPage",
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        "FM Towers booking suite — reference only. Official agreements and receipts prevail.",
        margin,
        pageH - 6,
      );
    },
  });

  let y = tableBottomY(doc) + 6;
  if (y > pageH - 35) {
    doc.addPage();
    y = margin + 6;
  }

  autoTable(doc, {
    startY: y,
    head: [["Summary (this export)", "Amount (PKR)"]],
    body: [
      ["Total due", formatPkrPdf(totalDue)],
      ["Total paid", formatPkrPdf(totalPaid)],
      ["Outstanding balance", formatPkrPdf(totalBal)],
    ],
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.6, textColor: [15, 23, 42] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 56, textColor: [71, 85, 105] },
      1: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: margin, right: margin },
  });

  const y2 = tableBottomY(doc) + 6;
  if (y2 < pageH - 20) {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(margin, y2, pageW - margin, y2);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
  doc.save(`installment-schedule-${stamp}.pdf`);
}

export async function downloadCustomerSummaryReportPdf(
  rows: CustomerInstallmentSummaryRow[],
  opts?: { title?: string; filterLabel?: string },
): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const title = opts?.title ?? "Installment summary — by customer";
  const filterLine = opts?.filterLabel?.trim() ? opts.filterLabel.trim() : "";

  const totalDue = rows.reduce((a, r) => a + r.totalDue, 0);
  const totalPaid = rows.reduce((a, r) => a + r.totalPaid, 0);
  const totalBal = rows.reduce((a, r) => a + r.totalBalance, 0);

  doc.setFillColor(250, 250, 252);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.45);
  doc.line(margin, 28, pageW - margin, 28);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("FM Towers", margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(title, margin, 20);
  if (filterLine) {
    doc.setFontSize(8.5);
    doc.text(filterLine, margin, 25);
  }
  doc.setFontSize(8);
  doc.text(
    `Generated: ${new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })} · ${rows.length} customer(s)`,
    pageW - margin,
    13,
    { align: "right" },
  );

  autoTable(doc, {
    startY: 36,
    head: [["Customer", "CNIC", "Bookings", "Lines", "Due", "Paid", "Balance"]],
    body: rows.map((r) => [
      r.customerName.length > 36 ? `${r.customerName.slice(0, 34)}…` : r.customerName,
      r.customerCnic || "—",
      String(r.bookingCount),
      String(r.installmentCount),
      formatPkrPdf(r.totalDue),
      formatPkrPdf(r.totalPaid),
      formatPkrPdf(r.totalBalance),
    ]),
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    columnStyles: {
      0: { cellWidth: 52 },
      1: { cellWidth: 32 },
      2: { halign: "center", cellWidth: 18 },
      3: { halign: "center", cellWidth: 16 },
      4: { halign: "right", cellWidth: 26 },
      5: { halign: "right", cellWidth: 26 },
      6: { halign: "right", cellWidth: 26 },
    },
    margin: { left: margin, right: margin },
    showHead: "everyPage",
    didDrawPage: () => {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("FM Towers booking suite — reference only.", margin, pageH - 8);
    },
  });

  let y = tableBottomY(doc) + 8;
  if (y > pageH - 40) {
    doc.addPage();
    y = margin + 8;
  }

  autoTable(doc, {
    startY: y,
    head: [["Totals", "PKR"]],
    body: [
      ["Total due", formatPkrPdf(totalDue)],
      ["Total paid", formatPkrPdf(totalPaid)],
      ["Outstanding", formatPkrPdf(totalBal)],
    ],
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 }, 1: { halign: "right", fontStyle: "bold" } },
    margin: { left: margin, right: margin },
  });

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
  doc.save(`installment-summary-customers-${stamp}.pdf`);
}
