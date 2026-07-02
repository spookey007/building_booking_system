"use server";

import type { BookingStatus, LedgerType } from "@prisma/client";
import { db } from "@/lib/db";
import { LEDGER_TYPE_LABELS } from "@/lib/ledger/ledger-classification";

const INACTIVE_BOOKING_STATUSES: BookingStatus[] = ["CANCELLED", "MERGED", "TRANSFERRED", "SWITCHED"];

export type LedgerLine = {
  date: string;
  customerName?: string;
  bookingNo: string;
  unitLabel: string;
  receivingNo: string | null;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  ledgerType: LedgerType;
  mode: string;
};

export type LedgerExportResult = {
  scope: "customer" | "portfolio";
  customerName: string;
  customerCnic: string | null;
  customerCount: number;
  ledgerTypes: LedgerType[];
  bookingNos: string[];
  fromDate: string | null;
  toDate: string | null;
  openingBalance: number;
  lines: LedgerLine[];
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
};

type BookingRow = {
  id: string;
  bookingNo: string;
  payableCost: unknown;
  grossTotal: unknown;
  unitPrice: unknown;
  addonUtility: unknown;
  addonParking: unknown;
  addonDocumentation: unknown;
  addonTax: unknown;
  addonPenalty: unknown;
  bookingTransferFee: unknown;
  unit: { unitNo: string; tower: { code: string } };
};

function formatUnitLabel(unit: { unitNo: string; tower: { code: string } }) {
  return `${unit.tower.code} · ${unit.unitNo}`;
}

function buildLedgerLinesForBookings(
  bookings: BookingRow[],
  payments: Array<{
    bookingId: string;
    amount: unknown;
    paymentDate: Date;
    ledgerType: LedgerType;
    mode: string;
    receiving: { receivingNo: string } | null;
    installment: { installmentNo: number } | null;
  }>,
  ledgerTypes: LedgerType[],
  customerName?: string,
): { lines: LedgerLine[]; totalCredits: number; totalDebits: number; closingBalance: number } {
  const bookingMap = new Map(bookings.map((b) => [b.id, b]));
  let running = 0;
  const lines: LedgerLine[] = [];

  function pushDebit(
    booking: BookingRow,
    amount: number,
    ledgerType: LedgerType,
    description: string,
  ) {
    if (amount <= 0 || !ledgerTypes.includes(ledgerType)) return;
    running += amount;
    lines.push({
      date: "",
      customerName,
      bookingNo: booking.bookingNo,
      unitLabel: formatUnitLabel(booking.unit),
      receivingNo: null,
      description,
      debit: amount,
      credit: 0,
      balance: running,
      ledgerType,
      mode: "—",
    });
  }

  for (const booking of bookings) {
    const unitPrice = Number(booking.unitPrice ?? 0);
    const officialCore =
      unitPrice +
      Number(booking.addonDocumentation ?? 0) +
      Number(booking.addonTax ?? 0);

    pushDebit(booking, officialCore, "OFFICIAL", `Contract payable — ${booking.bookingNo}`);
    pushDebit(booking, Number(booking.addonUtility ?? 0), "UTILITY", `Utility charges — ${booking.bookingNo}`);
    pushDebit(booking, Number(booking.addonParking ?? 0), "PARKING", `Parking charges — ${booking.bookingNo}`);
    pushDebit(
      booking,
      Number(booking.addonPenalty ?? 0) + Number(booking.bookingTransferFee ?? 0),
      "UNOFFICIAL",
      `Penalty / transfer fees — ${booking.bookingNo}`,
    );

    if (officialCore <= 0 && ledgerTypes.includes("OFFICIAL")) {
      const payable = Number(booking.payableCost ?? booking.grossTotal ?? 0);
      pushDebit(booking, payable, "OFFICIAL", `Contract payable — ${booking.bookingNo}`);
    }
  }

  for (const payment of payments) {
    const booking = bookingMap.get(payment.bookingId);
    if (!booking) continue;

    const amount = Number(payment.amount);
    running -= amount;

    const instLabel = payment.installment ? `Inst #${payment.installment.installmentNo}` : "General";
    lines.push({
      date: payment.paymentDate.toISOString().slice(0, 10),
      customerName,
      bookingNo: booking.bookingNo,
      unitLabel: formatUnitLabel(booking.unit),
      receivingNo: payment.receiving?.receivingNo ?? null,
      description: `${LEDGER_TYPE_LABELS[payment.ledgerType]} receipt — ${instLabel}`,
      debit: 0,
      credit: amount,
      balance: running,
      ledgerType: payment.ledgerType,
      mode: payment.mode,
    });
  }

  const totalCredits = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalDebits = lines.filter((l) => l.debit > 0).reduce((sum, l) => sum + l.debit, 0);

  return {
    lines,
    totalCredits,
    totalDebits,
    closingBalance: totalDebits - totalCredits,
  };
}

const bookingSelect = {
  id: true,
  bookingNo: true,
  payableCost: true,
  grossTotal: true,
  unitPrice: true,
  addonUtility: true,
  addonParking: true,
  addonDocumentation: true,
  addonTax: true,
  addonPenalty: true,
  bookingTransferFee: true,
  unit: { select: { unitNo: true, tower: { select: { code: true } } } },
} as const;

export async function buildCustomerLedgerExport(args: {
  customerId: string;
  bookingIds?: string[];
  ledgerTypes: LedgerType[];
  fromDate?: string;
  toDate?: string;
}): Promise<LedgerExportResult | null> {
  const customer = await db.customer.findUnique({
    where: { id: args.customerId },
    select: { fullName: true, cnic: true },
  });
  if (!customer) return null;

  const bookingWhere =
    args.bookingIds && args.bookingIds.length > 0
      ? { customerId: args.customerId, id: { in: args.bookingIds } }
      : { customerId: args.customerId, status: { notIn: INACTIVE_BOOKING_STATUSES } };

  const bookings = await db.booking.findMany({
    where: bookingWhere,
    select: bookingSelect,
    orderBy: { bookingDate: "asc" },
  });

  if (bookings.length === 0) {
    return {
      scope: "customer",
      customerName: customer.fullName,
      customerCnic: customer.cnic,
      customerCount: 1,
      ledgerTypes: args.ledgerTypes,
      bookingNos: [],
      fromDate: args.fromDate ?? null,
      toDate: args.toDate ?? null,
      openingBalance: 0,
      lines: [],
      closingBalance: 0,
      totalCredits: 0,
      totalDebits: 0,
    };
  }

  const bookingIds = bookings.map((b) => b.id);

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (args.fromDate) dateFilter.gte = new Date(`${args.fromDate}T00:00:00`);
  if (args.toDate) dateFilter.lte = new Date(`${args.toDate}T23:59:59`);

  const payments = await db.payment.findMany({
    where: {
      bookingId: { in: bookingIds },
      voidedAt: null,
      ledgerType: { in: args.ledgerTypes },
      ...(Object.keys(dateFilter).length > 0 ? { paymentDate: dateFilter } : {}),
    },
    include: {
      receiving: { select: { receivingNo: true } },
      installment: { select: { installmentNo: true } },
    },
    orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
  });

  const { lines, totalCredits, totalDebits, closingBalance } = buildLedgerLinesForBookings(
    bookings,
    payments,
    args.ledgerTypes,
    customer.fullName,
  );

  return {
    scope: "customer",
    customerName: customer.fullName,
    customerCnic: customer.cnic,
    customerCount: 1,
    ledgerTypes: args.ledgerTypes,
    bookingNos: bookings.map((b) => b.bookingNo),
    fromDate: args.fromDate ?? null,
    toDate: args.toDate ?? null,
    openingBalance: 0,
    lines,
    closingBalance,
    totalCredits,
    totalDebits,
  };
}

export async function buildPortfolioLedgerExport(args: {
  ledgerTypes: LedgerType[];
  fromDate?: string;
  toDate?: string;
}): Promise<LedgerExportResult> {
  const customers = await db.customer.findMany({
    where: {
      bookings: {
        some: { status: { notIn: INACTIVE_BOOKING_STATUSES } },
      },
    },
    select: { id: true, fullName: true, cnic: true },
    orderBy: { fullName: "asc" },
  });

  const bookings = await db.booking.findMany({
    where: { status: { notIn: INACTIVE_BOOKING_STATUSES } },
    select: {
      ...bookingSelect,
      customerId: true,
      customer: { select: { fullName: true } },
    },
    orderBy: [{ customer: { fullName: "asc" } }, { bookingDate: "asc" }],
  });

  const bookingIds = bookings.map((b) => b.id);

  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (args.fromDate) dateFilter.gte = new Date(`${args.fromDate}T00:00:00`);
  if (args.toDate) dateFilter.lte = new Date(`${args.toDate}T23:59:59`);

  const payments = await db.payment.findMany({
    where: {
      bookingId: { in: bookingIds },
      voidedAt: null,
      ledgerType: { in: args.ledgerTypes },
      ...(Object.keys(dateFilter).length > 0 ? { paymentDate: dateFilter } : {}),
    },
    include: {
      receiving: { select: { receivingNo: true } },
      installment: { select: { installmentNo: true } },
    },
    orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
  });

  const paymentsByBooking = new Map<string, typeof payments>();
  for (const payment of payments) {
    const list = paymentsByBooking.get(payment.bookingId) ?? [];
    list.push(payment);
    paymentsByBooking.set(payment.bookingId, list);
  }

  const lines: LedgerLine[] = [];
  let totalCredits = 0;
  let totalDebits = 0;

  for (const customer of customers) {
    const customerBookings = bookings.filter((b) => b.customerId === customer.id);
    if (customerBookings.length === 0) continue;

    const customerPayments = customerBookings.flatMap((b) => paymentsByBooking.get(b.id) ?? []);
    const section = buildLedgerLinesForBookings(
      customerBookings,
      customerPayments,
      args.ledgerTypes,
      customer.fullName,
    );

    lines.push(...section.lines);
    totalCredits += section.totalCredits;
    totalDebits += section.totalDebits;
  }

  return {
    scope: "portfolio",
    customerName: "All customers",
    customerCnic: null,
    customerCount: customers.length,
    ledgerTypes: args.ledgerTypes,
    bookingNos: bookings.map((b) => b.bookingNo),
    fromDate: args.fromDate ?? null,
    toDate: args.toDate ?? null,
    openingBalance: 0,
    lines,
    closingBalance: totalDebits - totalCredits,
    totalCredits,
    totalDebits,
  };
}
