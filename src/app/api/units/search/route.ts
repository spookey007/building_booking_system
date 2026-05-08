import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatUnitLabel } from "@/lib/unit-display";

/** Units that can be picked for a new booking (not already sold/booked). */
const BOOKABLE_LISTING_STATUSES = ["AVAILABLE", "HOLD"] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectCode = (searchParams.get("projectCode") ?? "").trim().toUpperCase();
  const query = (searchParams.get("q") ?? "").trim().toUpperCase();
  const compactQuery = query.replace(/[^A-Z0-9]/g, "");
  const includeUnitId = (searchParams.get("includeUnitId") ?? "").trim();

  if (!projectCode) {
    return NextResponse.json({ items: [] });
  }

  if (!query || query.length < 1) {
    return NextResponse.json({ items: [] });
  }

  const availabilityClause =
    includeUnitId.length > 0
      ? {
          OR: [{ listingStatus: { in: [...BOOKABLE_LISTING_STATUSES] } }, { id: includeUnitId }],
        }
      : { listingStatus: { in: [...BOOKABLE_LISTING_STATUSES] } };

  const textSearchOr: Prisma.UnitWhereInput[] = [
    { unitNo: { contains: query, mode: Prisma.QueryMode.insensitive } },
    { unitNo: { contains: compactQuery, mode: Prisma.QueryMode.insensitive } },
    { prefix: { contains: query, mode: Prisma.QueryMode.insensitive } },
    { prefix: { contains: compactQuery, mode: Prisma.QueryMode.insensitive } },
    { tower: { code: { contains: query, mode: Prisma.QueryMode.insensitive } } },
  ];

  const units = await db.unit.findMany({
    take: 20,
    orderBy: [{ unitNo: "asc" }],
    where: {
      project: { code: projectCode },
      AND: [availabilityClause, { OR: textSearchOr }],
    },
    include: {
      project: { select: { code: true, name: true } },
      tower: { select: { code: true } },
      category: { select: { code: true } },
      facingType: { select: { code: true, name: true } },
    },
  });

  return NextResponse.json({
    items: units.map((unit) => {
      const displayLabel = formatUnitLabel(unit.tower.code, unit.unitNo, unit.prefix);
      return {
        id: unit.id,
        projectCode: unit.project.code,
        projectName: unit.project.name,
        displayLabel,
        unitNo: unit.unitNo,
        towerCode: unit.tower.code,
        prefix: unit.prefix ?? "",
        floorNo: unit.floorNo ?? "",
        category: unit.category?.code ?? "",
        unitType: unit.unitKind,
        size: unit.areaSqft.toString(),
        rooms: unit.rooms ?? "",
        facing: unit.facingType?.name ?? unit.facingType?.code ?? "",
        basePrice: unit.basePrice?.toString() ?? "0",
        transferCharges: unit.transferCharges?.toString() ?? "0",
      };
    }),
  });
}
