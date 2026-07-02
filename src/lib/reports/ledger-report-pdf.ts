import type { LedgerExportResult } from "@/lib/actions/ledger-actions";
import { LEDGER_TYPE_LABELS } from "@/lib/ledger/ledger-classification";
import { drawFmReportPdfHeader, formatPkrPdf } from "@/lib/reports/report-pdf-header";

export async function downloadCustomerLedgerPdf(exportResult: LedgerExportResult): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 12;

  const typeLabel = exportResult.ledgerTypes.map((t) => LEDGER_TYPE_LABELS[t]).join(", ");
  const period =
    exportResult.fromDate || exportResult.toDate
      ? `Period: ${exportResult.fromDate ?? "…"} → ${exportResult.toDate ?? "…"}`
      : "Period: All dates";
  const bookingScope =
    exportResult.scope === "portfolio"
      ? `${exportResult.customerCount} customers · ${exportResult.bookingNos.length} bookings`
      : exportResult.bookingNos.length > 0
        ? `Bookings: ${exportResult.bookingNos.join(", ")}`
        : "No bookings";
  const showCustomer = exportResult.scope === "portfolio";

  const startY = drawFmReportPdfHeader(doc, {
    title: exportResult.scope === "portfolio" ? "Portfolio ledger statement" : "Customer ledger statement",
    subtitle: `${exportResult.customerName}${exportResult.customerCnic ? ` · ${exportResult.customerCnic}` : ""} · ${typeLabel}`,
    metaRight: `${exportResult.lines.length} line(s)`,
  });

  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`${bookingScope} · ${period}`, margin, startY - 1);
  doc.text(
    `Total debits: ${formatPkrPdf(exportResult.totalDebits)} · Total received: ${formatPkrPdf(exportResult.totalCredits)} · Closing balance: ${formatPkrPdf(exportResult.closingBalance)}`,
    margin,
    startY + 3,
  );

  autoTable(doc, {
    startY: startY + 8,
    head: [
      [
        ...(showCustomer ? ["Customer"] : []),
        "Date",
        "Booking",
        "Unit",
        "Receiving",
        "Description",
        "Debit",
        "Credit",
        "Balance",
        "Ledger",
        "Mode",
      ],
    ],
    body: exportResult.lines.map((line) => [
      ...(showCustomer ? [line.customerName ?? "—"] : []),
      line.date || "—",
      line.bookingNo,
      line.unitLabel,
      line.receivingNo ?? "—",
      line.description.length > 42 ? `${line.description.slice(0, 40)}…` : line.description,
      line.debit > 0 ? formatPkrPdf(line.debit) : "—",
      line.credit > 0 ? formatPkrPdf(line.credit) : "—",
      formatPkrPdf(line.balance),
      LEDGER_TYPE_LABELS[line.ledgerType],
      line.mode,
    ]),
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    margin: { left: margin, right: margin },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`FM Towers — Customer ledger · Page ${i} of ${pageCount}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, {
      align: "center",
    });
  }

  const safeName = exportResult.customerName.replace(/[^\w\-]+/g, "-").slice(0, 40);
  doc.save(
    exportResult.scope === "portfolio"
      ? "fm-towers-portfolio-ledger.pdf"
      : `fm-towers-ledger-${safeName}.pdf`,
  );
}
