import type { jsPDF } from "jspdf";

export const FM_REPORT_BRAND = {
  name: "FM Towers",
  subtitle: "Karachi · Apartment Booking & Collections",
};

export type ReportPdfHeaderOptions = {
  title: string;
  subtitle?: string;
  metaRight?: string;
  margin?: number;
};

/** FM Towers branded header band for jspdf reports. Returns Y where table content should start. */
export function drawFmReportPdfHeader(doc: jsPDF, opts: ReportPdfHeaderOptions): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = opts.margin ?? 12;
  const bandH = 28;

  doc.setFillColor(250, 250, 252);
  doc.rect(0, 0, pageW, bandH, "F");
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.5);
  doc.line(margin, bandH - 2, pageW - margin, bandH - 2);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(FM_REPORT_BRAND.name, margin, 11);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(opts.title, margin, 17);
  if (opts.subtitle?.trim()) {
    doc.setFontSize(8);
    doc.text(opts.subtitle.trim(), margin, 22);
  }

  const generated = new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
  doc.setFontSize(8);
  doc.text(opts.metaRight ?? `Generated: ${generated}`, pageW - margin, 11, { align: "right" });
  if (!opts.metaRight) {
    doc.text(FM_REPORT_BRAND.subtitle, pageW - margin, 17, { align: "right" });
  }

  return bandH + 4;
}

export function formatPkrPdf(n: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}
