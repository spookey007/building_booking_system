import { db } from "@/lib/db";
import { formatUnitLabel } from "@/lib/unit-display";
import { StockReportWorkspace, type StockReportRow } from "./stock-report-workspace";

export const dynamic = "force-dynamic";

function formatNumber(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export default async function StockReportPage() {
  const units = await db.unit.findMany({
    include: {
      project: { select: { code: true } },
      tower: { select: { code: true } },
    },
    orderBy: [{ project: { code: "asc" } }, { tower: { code: "asc" } }, { unitNo: "asc" }],
  });

  const rows: StockReportRow[] = units.map((unit) => ({
    id: unit.id,
    projectCode: unit.project.code,
    towerCode: unit.tower.code,
    unitNo: unit.unitNo,
    displayLabel: formatUnitLabel(unit.tower.code, unit.unitNo, unit.prefix),
    unitKind: unit.unitKind,
    listingStatus: unit.listingStatus,
    floorNo: unit.floorNo != null ? String(unit.floorNo) : "-",
    areaSqft: formatNumber(Number(unit.areaSqft)),
    basePrice: formatNumber(Number(unit.basePrice ?? 0)),
    transferCharges: formatNumber(Number(unit.transferCharges ?? 0)),
  }));

  return <StockReportWorkspace rows={rows} />;
}
