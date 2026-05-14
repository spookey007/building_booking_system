import type { PaymentScheduleDemoInput } from "@/lib/validations/payment-schedule-demo";

function tableBottomY(doc: object): number {
  const t = doc as { lastAutoTable?: { finalY: number } };
  return t.lastAutoTable?.finalY ?? 40;
}

function formatMoney(amount: number, currency: "PKR" | "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "PKR" ? 0 : 2,
  }).format(amount);
}

export async function downloadPaymentSchedulePdf(
  bookingLabel: string,
  data: PaymentScheduleDemoInput,
): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 12;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, 36, "F");
  doc.setDrawColor(79, 70, 229);
  doc.setLineWidth(0.55);
  doc.line(margin, 34, pageW - margin, 34);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FM Towers", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text("Installment schedule", margin, 20);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}`, pageW - margin, 16, {
    align: "right",
  });

  y = 42;
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Summary", margin, y);
  y += 4;

  const totalDue = data.rows.reduce((acc, row) => acc + row.amount, 0);
  const totalPaid = data.rows.reduce((acc, row) => acc + Math.min(row.paidAmount, row.amount), 0);
  const pending = Math.max(0, totalDue - totalPaid);
  const planLine = data.planTitle && data.planTitle.trim() !== "" ? data.planTitle : "—";

  autoTable(doc, {
    startY: y,
    body: [
      ["Booking", bookingLabel],
      ["Booking ID", data.bookingId],
      ["Plan note", planLine],
      ["Currency", data.currency],
      ["Contract total", formatMoney(data.totalAmount, data.currency)],
      ["Total due (rows)", formatMoney(totalDue, data.currency)],
      ["Total paid (rows)", formatMoney(totalPaid, data.currency)],
      ["Pending collection", formatMoney(pending, data.currency)],
      ["Installment rows", String(data.rows.length)],
    ],
    theme: "plain",
    styles: { fontSize: 9.5, cellPadding: 1.8, textColor: [15, 23, 42] },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 52, textColor: [51, 65, 85] } },
    margin: { left: margin, right: margin },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.2,
  });

  y = tableBottomY(doc) + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Installments", margin, y);
  y += 4;

  const body = data.rows.map((row) => {
    const paid = Math.min(row.paidAmount, row.amount);
    const left = row.amount - paid;
    return [
      String(row.installmentNo),
      row.dueDate,
      formatMoney(row.amount, data.currency),
      formatMoney(paid, data.currency),
      formatMoney(left, data.currency),
      row.label?.trim() ? row.label : `Inst. ${row.installmentNo}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [["#", "Due", "Due amt", "Paid", "Balance", "Label"]],
    body,
    theme: "striped",
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 24 },
      2: { cellWidth: 26 },
      3: { cellWidth: 26 },
      4: { cellWidth: 26 },
    },
    margin: { left: margin, right: margin },
  });

  y = tableBottomY(doc) + 10;

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimer = doc.splitTextToSize(
    "Reference only from the FM Towers booking suite. Executed agreements and official receipts prevail.",
    pageW - 2 * margin,
  );
  doc.text(disclaimer, margin, y + 5);

  const safeName = (data.planTitle || "schedule").replace(/[^\w.-]+/g, "_").slice(0, 50);
  doc.save(`payment-schedule-${data.bookingId.slice(0, 12)}-${safeName}.pdf`);
}
