import { db } from "@/lib/db";
import { UnitsTable } from "./units-table";
import { UnitsImportPanel } from "./units-import-panel";
import { formatUnitLabel } from "@/lib/unit-display";

export const dynamic = "force-dynamic";

export default async function UnitsPage() {
  const units = await db.unit.findMany({
    take: 30,
    orderBy: [{ tower: { code: "asc" } }, { floorNo: "asc" }, { unitNo: "asc" }],
    include: {
      tower: true,
      category: true,
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Units</h2>
        <p className="text-sm text-slate-500">Unified residential + commercial inventory.</p>
      </div>
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
