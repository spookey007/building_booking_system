import type { BookingFormInput } from "@/lib/validations/booking-form";

export type BookingDocumentPdfInput = {
  bookingNo: string;
  bookingDate: string;
  customerName: string;
  unitLabel: string;
  projectCode: string;
  mode: string;
  status: string;
  unitPrice: string;
  discountAmount: string;
  cashPayable: string;
  grossTotal: string;
  payableCost: string;
  notes: string;
  formDefaults: Partial<BookingFormInput>;
};

function dash(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "—";
  const s = String(value).trim();
  return s === "" ? "—" : s;
}

function tableBottomY(doc: object): number {
  const t = doc as { lastAutoTable?: { finalY: number } };
  return t.lastAutoTable?.finalY ?? 40;
}

async function fetchLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/logo.png", { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => reject(new Error("read"));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generates a printable A4 booking record with branding (client-side only).
 */
export async function downloadBookingDocumentPdf(
  row: BookingDocumentPdfInput,
  options?: { projectName?: string },
): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 12;

  const logo = await fetchLogoDataUrl();

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, 42, "F");
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.6);
  doc.line(margin, 40, pageW - margin, 40);

  if (logo) {
    try {
      doc.addImage(logo, "PNG", margin, 8, 22, 22);
    } catch {
      /* ignore bad image */
    }
  }

  const titleX = logo ? margin + 26 : margin;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("FM Towers", titleX, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Booking & allotment record", titleX, 22);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}`, pageW - margin, 20, {
    align: "right",
  });

  y = 48;

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Booking summary", margin, y);
  y += 4;

  const f = row.formDefaults;
  const projectLine = options?.projectName
    ? `${row.projectCode} — ${options.projectName}`
    : row.projectCode;

  const summaryRows: string[][] = [
    ["Booking number", row.bookingNo],
    ["Booking date", row.bookingDate],
    ["Status", row.status],
    ["Mode", row.mode],
    ["Project", projectLine],
    ["Unit", row.unitLabel],
  ];
  if (dash(f.transferDate) !== "—") summaryRows.push(["Transfer date", String(f.transferDate)]);
  if (dash(f.switchingDate) !== "—") summaryRows.push(["Switching date", String(f.switchingDate)]);
  if (dash(f.switchToUnitNo) !== "—") summaryRows.push(["Switch to unit", String(f.switchToUnitNo)]);
  if (dash(f.cancelDate) !== "—") summaryRows.push(["Cancel date", String(f.cancelDate)]);

  autoTable(doc, {
    startY: y,
    head: [],
    body: summaryRows,
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 1.8, textColor: [15, 23, 42] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48, textColor: [51, 65, 85] },
    },
    margin: { left: margin, right: margin },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
  });

  y = tableBottomY(doc) + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Unit details", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    body: [
      ["Tower", dash(f.tower)],
      ["Unit no.", dash(f.unitNo)],
      ["Floor", f.floorNo != null ? String(f.floorNo) : "—"],
      ["Category", dash(f.category)],
      ["Unit type", dash(f.unitType)],
      ["Size (sq ft)", f.size != null ? String(f.size) : "—"],
      ["Rooms", f.rooms != null && f.rooms !== "" ? String(f.rooms) : "—"],
      ["Facing", dash(f.facing)],
    ],
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9.5, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 48 } },
    margin: { left: margin, right: margin },
  });

  y = tableBottomY(doc) + 10;

  if (y > 250) {
    doc.addPage();
    y = margin + 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Primary applicant", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    body: [
      ["Full name", dash(f.fullName ?? row.customerName)],
      ["Father / husband", dash(f.fatherHusband)],
      ["CNIC", dash(f.cnic)],
      ["Passport", dash(f.passportNo)],
      ["Nationality", dash(f.nationality)],
      ["Postal address", dash(f.postalAddress)],
      ["Phone (office)", dash(f.phoneOffice)],
      ["Phone (res.)", dash(f.phoneRes)],
      ["WhatsApp", dash(f.whatsapp)],
      ["Email", dash(f.email)],
      ["Occupation", dash(f.occupation)],
      ["Income", f.income != null ? String(f.income) : "—"],
      ["Age", f.age != null ? String(f.age) : "—"],
      ["Broker", dash(f.broker)],
      ["Care of", dash(f.careOf)],
    ],
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 9.5, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 } },
    margin: { left: margin, right: margin },
  });

  y = tableBottomY(doc) + 10;

  const hasNominee =
    [f.nomineeName, f.relation, f.nomineeFatherName, f.nomineeAddress, f.nomineeCnic, f.nomineeCell, f.nomineePassport].some(
      (v) => v != null && String(v).trim() !== "",
    );

  if (hasNominee) {
    if (y > 245) {
      doc.addPage();
      y = margin + 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Nominee", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      body: [
        ["Name", dash(f.nomineeName)],
        ["Relation", dash(f.relation)],
        ["Father name", dash(f.nomineeFatherName)],
        ["Address", dash(f.nomineeAddress)],
        ["CNIC", dash(f.nomineeCnic)],
        ["Cell", dash(f.nomineeCell)],
        ["Passport", dash(f.nomineePassport)],
      ],
      theme: "striped",
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9.5, cellPadding: 1.8 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 42 } },
      margin: { left: margin, right: margin },
    });
    y = tableBottomY(doc) + 10;
  }

  if (y > 240) {
    doc.addPage();
    y = margin + 6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Financial summary (PKR)", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    body: [
      ["Unit price", row.unitPrice],
      ["Discount", row.discountAmount],
      ["Cash payable", row.cashPayable],
      ["Gross total", row.grossTotal],
      ["Payable cost", row.payableCost],
    ],
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 52 } },
    margin: { left: margin, right: margin },
  });

  y = tableBottomY(doc) + 8;

  if (row.notes && row.notes.trim() !== "") {
    if (y > 270) {
      doc.addPage();
      y = margin + 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Notes", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const split = doc.splitTextToSize(row.notes, pageW - 2 * margin);
    doc.text(split, margin, y);
    y += split.length * 4.2 + 6;
  }

  const footY = Math.min(y + 14, 285);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, footY, pageW - margin, footY);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimer = doc.splitTextToSize(
    "This document is generated from the FM Towers booking system for reference only. Executed agreements and official receipts prevail.",
    pageW - 2 * margin,
  );
  doc.text(disclaimer, margin, footY + 5);

  doc.save(`booking-${row.bookingNo.replace(/[^\w.-]+/g, "_")}.pdf`);
}
