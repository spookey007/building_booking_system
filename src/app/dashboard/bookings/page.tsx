import { db } from "@/lib/db";
import { BookingsWorkspace } from "./bookings-workspace";
import { formatUnitLabel } from "@/lib/unit-display";

export const dynamic = "force-dynamic";

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatAmount(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function getCurrentWeekRange() {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(now.getMonth() - 6);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    startDate: toDateOnly(start),
    endDate: toDateOnly(end),
  };
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const defaults = getCurrentWeekRange();
  const startDateParam =
    typeof params.startDate === "string" && params.startDate.trim() !== "" ? params.startDate : defaults.startDate;
  const endDateParam = typeof params.endDate === "string" && params.endDate.trim() !== "" ? params.endDate : defaults.endDate;

  const parsedStart = new Date(`${startDateParam}T00:00:00`);
  const parsedEnd = new Date(`${endDateParam}T23:59:59.999`);
  const startInvalid = Number.isNaN(parsedStart.getTime());
  const endInvalid = Number.isNaN(parsedEnd.getTime());
  const startDate = startInvalid ? new Date(`${defaults.startDate}T00:00:00`) : parsedStart;
  const endDate = endInvalid ? new Date(`${defaults.endDate}T23:59:59.999`) : parsedEnd;
  const uiStartDate = startInvalid ? defaults.startDate : startDateParam;
  const uiEndDate = endInvalid ? defaults.endDate : endDateParam;

  const [bookings, projects, mergeCandidates] = await Promise.all([
    db.booking.findMany({
      orderBy: { bookingDate: "desc" },
      where: {
        bookingDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        project: { select: { code: true } },
        customer: { include: { nominees: true } },
        unit: { include: { tower: true, category: true, facingType: true } },
        switchToUnit: { include: { tower: true } },
      },
    }),
    db.project.findMany({
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.booking.findMany({
      where: { status: { notIn: ["CANCELLED", "TRANSFERRED", "SWITCHED", "MERGED"] } },
      select: {
        id: true,
        bookingNo: true,
        customerId: true,
        status: true,
        customer: { select: { fullName: true } },
        unit: { include: { tower: { select: { code: true } } } },
      },
      orderBy: { bookingDate: "desc" },
    }),
  ]);

  return (
    <BookingsWorkspace
      startDate={uiStartDate}
      endDate={uiEndDate}
      projects={projects}
      mergeCandidates={mergeCandidates.map((b) => ({
        id: b.id,
        bookingNo: b.bookingNo,
        customerId: b.customerId,
        customerName: b.customer.fullName,
        unitLabel: formatUnitLabel(b.unit.tower.code, b.unit.unitNo, null),
        status: b.status,
      }))}
      rows={bookings.map((booking) => ({
        id: booking.id,
        unitId: booking.unitId,
        bookingNo: booking.bookingNo,
        bookingDate: booking.bookingDate.toISOString().slice(0, 10),
        customerName: booking.customer.fullName,
        unitLabel: formatUnitLabel(booking.unit.tower.code, booking.unit.unitNo, booking.unit.prefix),
        mode: booking.mode,
        status: booking.status,
        projectCode: booking.project.code,
        towerCode: booking.unit.tower.code,
        unitNo: booking.unit.unitNo,
        unitPrice: formatAmount(Number(booking.unitPrice ?? 0)),
        discountAmount: formatAmount(Number(booking.discountAmount ?? 0)),
        cashPayable: formatAmount(Number(booking.cashPayable ?? 0)),
        payableCost: formatAmount(Number(booking.payableCost ?? 0)),
        notes: booking.notes ?? "",
        grossTotal: formatAmount(Number(booking.grossTotal ?? 0)),
        formDefaults: {
          bookingDate: booking.bookingDate.toISOString().slice(0, 10),
          mode: booking.mode,
          transferDate: booking.transferDate ? booking.transferDate.toISOString().slice(0, 10) : "",
          switchingDate: (booking.switchDate ?? booking.switchingDate)
            ? (booking.switchDate ?? booking.switchingDate)?.toISOString().slice(0, 10)
            : "",
          switchToUnitNo: booking.switchToUnit
            ? formatUnitLabel(booking.switchToUnit.tower.code, booking.switchToUnit.unitNo, booking.switchToUnit.prefix)
            : "",
          cancelDate: booking.cancelDate ? booking.cancelDate.toISOString().slice(0, 10) : "",
          projectCode: booking.project.code,
          unitNo: booking.unit.unitNo,
          tower: booking.unit.tower.code,
          floorNo: booking.unit.floorNo != null ? String(booking.unit.floorNo) : "",
          category: booking.unit.category?.code ?? "",
          unitType: booking.unit.unitKind,
          size: booking.unit.areaSqft.toString(),
          rooms: booking.unit.rooms != null ? String(booking.unit.rooms) : "",
          facing: booking.unit.facingType?.name ?? booking.unit.facingType?.code ?? "",
          fullName: booking.customer.fullName,
          fatherHusband: booking.customer.fatherHusband ?? "",
          postalAddress: booking.customer.postalAddress ?? "",
          phoneOffice: booking.customer.phoneOffice ?? "",
          phoneRes: booking.customer.phoneRes ?? "",
          whatsapp: booking.customer.whatsapp ?? "",
          email: booking.customer.email ?? undefined,
          income: booking.customer.income != null ? Number(booking.customer.income) : undefined,
          age: booking.customer.age ?? undefined,
          nationality: booking.customer.nationality ?? "",
          cnic: booking.customer.cnic ?? undefined,
          passportNo: booking.customer.passportNo ?? undefined,
          occupation: booking.customer.occupation ?? "",
          broker: booking.customer.broker ?? "",
          careOf: booking.customer.careOf ?? "",
          nomineeName: booking.customer.nominees[0]?.name ?? "",
          relation: booking.customer.nominees[0]?.relation ?? "",
          nomineeFatherName: booking.customer.nominees[0]?.fatherName ?? "",
          nomineeAddress: booking.customer.nominees[0]?.address ?? "",
          nomineeCnic: booking.customer.nominees[0]?.cnic ?? undefined,
          nomineePassport: booking.customer.nominees[0]?.passportNo ?? undefined,
          nomineeCell: booking.customer.nominees[0]?.cell ?? undefined,
          priceOfUnit: booking.unitPrice != null ? Number(booking.unitPrice) : Number(booking.unit.basePrice ?? 0),
          cashPayable: booking.cashPayable != null ? Number(booking.cashPayable) : 0,
          discountAmount: booking.discountAmount != null ? Number(booking.discountAmount) : 0,
          transferCharges:
            booking.mode === "TRANSFER" ? Number(booking.unit.transferCharges ?? 0) : 0,
          addonParking: Number(booking.addonParking ?? 0),
          addonUtility: Number(booking.addonUtility ?? 0),
          addonDocumentation: Number(booking.addonDocumentation ?? 0),
          addonTax: Number(booking.addonTax ?? 0),
          addonPenalty: Number(booking.addonPenalty ?? 0),
          bookingTransferFee: Number(booking.bookingTransferFee ?? 0),
          expectedLoan: undefined,
          grossTotal: booking.grossTotal != null ? Number(booking.grossTotal) : 0,
          payableCost: booking.payableCost != null ? Number(booking.payableCost) : 0,
        },
      }))}
    />
  );
}
