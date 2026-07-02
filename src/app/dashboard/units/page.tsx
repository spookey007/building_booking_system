import Link from "next/link";
import { db } from "@/lib/db";
import { UnitsTable } from "./units-table";
import { UnitsImportPanel } from "./units-import-panel";
import { formatUnitLabel } from "@/lib/unit-display";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const [units, statusCounts, totalUnits] = await Promise.all([
    db.unit.findMany({
      orderBy: [{ tower: { code: "asc" } }, { floorNo: "asc" }, { unitNo: "asc" }],
      include: {
        tower: true,
        category: true,
      },
    }),
    db.unit.groupBy({ by: ["listingStatus"], _count: { _all: true } }),
    db.unit.count(),
  ]);

  const statusMap = Object.fromEntries(statusCounts.map((row) => [row.listingStatus, row._count._all]));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Units</h2>
        <p className="text-sm text-slate-500">
          {totalUnits} units total. Sold units ({statusMap.SOLD ?? 0}) are fully allocated; booked ({statusMap.BOOKED ?? 0})
          are reserved under active demo bookings.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Available", count: statusMap.AVAILABLE ?? 0, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "Hold", count: statusMap.HOLD ?? 0, tone: "text-amber-700 bg-amber-50 border-amber-200" },
          { label: "Booked", count: statusMap.BOOKED ?? 0, tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
          { label: "Sold", count: statusMap.SOLD ?? 0, tone: "text-slate-700 bg-slate-100 border-slate-300" },
          { label: "Total", count: totalUnits, tone: "text-brand-700 bg-brand-50 border-brand-200" },
        ].map((item) => (
          <Card key={item.label} className={`border p-3 ${item.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{item.label}</p>
            <p className="mt-1 text-2xl font-bold">{item.count}</p>
          </Card>
        ))}
      </div>

      <p className="text-sm text-slate-600">
        For a printable stock breakdown see{" "}
        <Link href="/dashboard/reports/stock" className="font-semibold text-brand-600 hover:underline">
          Stock report
        </Link>
        .
      </p>

      <UnitsImportPanel />
      <UnitsTable
        data={units.map((unit) => ({
          id: unit.id,
          unitNo: formatUnitLabel(unit.tower.code, unit.unitNo, unit.prefix),
          towerCode: unit.tower.code,
          prefix: unit.prefix ?? "-",
          floorNo: unit.floorNo?.toString() ?? "-",
          unitKind: unit.unitKind,
          categoryCode: unit.category?.code ?? "-",
          areaSqft: unit.areaSqft.toString(),
          listingStatus: unit.listingStatus,
        }))}
      />
    </div>
  );
}
