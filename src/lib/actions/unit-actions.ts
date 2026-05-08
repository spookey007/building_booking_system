"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { normalizeUnitNoForStorage } from "@/lib/unit-display";
import { Prisma } from "@prisma/client";

export type UnitImportActionState =
  | { ok: true; message: string; processed: number }
  | { ok: false; message: string; details?: string[] };

export type UnitImportRowStatus = "NEW" | "DUPLICATE" | "INVALID";

export type UnitImportPreviewRow = {
  rowNumber: number;
  projectCode: string;
  towerCode: string;
  prefix: string;
  unitNoRaw: string;
  unitNoNormalized: string;
  displayLabel: string;
  status: UnitImportRowStatus;
  reason: string;
};

export type UnitImportAnalysisResult =
  | {
      ok: true;
      message: string;
      rows: UnitImportPreviewRow[];
      importableCount: number;
      duplicateCount: number;
      invalidCount: number;
      importPayload: string;
    }
  | {
      ok: false;
      message: string;
      rows: UnitImportPreviewRow[];
      importableCount: number;
      duplicateCount: number;
      invalidCount: number;
      importPayload: string;
    };

const REQUIRED_HEADERS = [
  "project_code",
  "tower_code",
  "unit_no",
  "unit_kind",
  "area_sqft",
  "listing_status",
] as const;

const rowSchema = z.object({
  project_code: z.string().trim().min(1),
  tower_code: z.string().trim().min(1),
  prefix: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      return v.toUpperCase().replace(/\s+/g, "");
    }),
  unit_no: z.string().trim().min(1),
  floor_no: z.string().trim().optional(),
  unit_kind: z.enum(["RESIDENTIAL", "COMMERCIAL", "PENTHOUSE"]),
  category_code: z.string().trim().optional(),
  facing_code: z.string().trim().optional(),
  area_sqft: z.coerce.number().positive().max(1_000_000),
  rooms: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : undefined))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= 20), "rooms invalid"),
  listing_status: z.enum(["AVAILABLE", "HOLD", "BOOKED", "SOLD", "CANCELLED"]),
  serial_no: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number.parseInt(v, 10) : undefined))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0), "serial_no invalid"),
  base_price: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), "base_price invalid"),
  transfer_charges: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (Number.isFinite(v) && v >= 0), "transfer_charges invalid"),
});

const importPayloadRowSchema = z.object({
  projectId: z.string().min(1),
  towerId: z.string().min(1),
  prefix: z.string().nullable(),
  unitNo: z.string().min(1),
  floorNo: z.number().int().nullable(),
  unitKind: z.enum(["RESIDENTIAL", "COMMERCIAL", "PENTHOUSE"]),
  categoryId: z.string().nullable(),
  facingTypeId: z.string().nullable(),
  areaSqft: z.number().positive().max(1_000_000),
  rooms: z.number().int().min(0).max(20).nullable(),
  listingStatus: z.enum(["AVAILABLE", "HOLD", "BOOKED", "SOLD", "CANCELLED"]),
  serialNo: z.number().int().min(0).nullable(),
  basePrice: z.number().min(0).nullable(),
  transferCharges: z.number().min(0).nullable(),
});

const importPayloadSchema = z.array(importPayloadRowSchema);

function parseCsvRows(text: string) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header and at least one data row.");
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required headers: ${missingHeaders.join(", ")}`);
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

type ImportableUnitPayload = z.infer<typeof importPayloadRowSchema>;

function parseOptionalInt(value: string) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

type AnalyzePreparedResult = {
  rows: UnitImportPreviewRow[];
  importableRows: ImportableUnitPayload[];
};

async function analyzeCsvFromFile(file: File): Promise<AnalyzePreparedResult> {
  if (file.size === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("CSV must be smaller than 5MB.");
  }

  const rawText = await file.text();
  let parsedRows: Record<string, string>[];
  try {
    parsedRows = parseCsvRows(rawText);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid CSV format.");
  }

  const rows: UnitImportPreviewRow[] = [];
  const importableRows: ImportableUnitPayload[] = [];
  const seenInFile = new Set<string>();

  const projectCache = new Map<string, { id: string } | null>();
  const towerCache = new Map<string, { id: string } | null>();
  const categoryCache = new Map<string, { id: string } | null>();
  const facingCache = new Map<string, { id: string } | null>();

  for (let index = 0; index < parsedRows.length; index += 1) {
    const rowNumber = index + 2;
    const raw = parsedRows[index];
    const candidate = {
      project_code: (raw.project_code ?? "").toUpperCase(),
      tower_code: (raw.tower_code ?? "").toUpperCase(),
      prefix: raw.prefix ?? "",
      unit_no: raw.unit_no ?? "",
      floor_no: raw.floor_no ?? "",
      unit_kind: (raw.unit_kind ?? "").toUpperCase(),
      category_code: (raw.category_code ?? "").toUpperCase(),
      facing_code: (raw.facing_code ?? "").toUpperCase(),
      area_sqft: raw.area_sqft ?? "",
      rooms: raw.rooms ?? "",
      listing_status: (raw.listing_status ?? "").toUpperCase(),
      serial_no: raw.serial_no ?? "",
      base_price: raw.base_price ?? "",
      transfer_charges: raw.transfer_charges ?? "",
    };

    const parsed = rowSchema.safeParse(candidate);
    if (!parsed.success) {
      rows.push({
        rowNumber,
        projectCode: candidate.project_code,
        towerCode: candidate.tower_code,
        prefix: candidate.prefix,
        unitNoRaw: candidate.unit_no,
        unitNoNormalized: "",
        displayLabel: candidate.unit_no,
        status: "INVALID",
        reason: parsed.error.issues[0]?.message ?? "invalid row",
      });
      continue;
    }

    const data = parsed.data;
    const projectCode = data.project_code;
    const towerCode = data.tower_code;
    const prefix = data.prefix ?? "";
    const normalizedUnitNo = normalizeUnitNoForStorage(towerCode, data.unit_no, prefix);
    const cacheTowerKey = `${projectCode}::${towerCode}`;
    const displayPrefix = prefix || towerCode;
    const displayLabel = normalizedUnitNo ? `${displayPrefix}-${normalizedUnitNo}` : "";

    if (!normalizedUnitNo) {
      rows.push({
        rowNumber,
        projectCode,
        towerCode,
        prefix,
        unitNoRaw: data.unit_no,
        unitNoNormalized: "",
        displayLabel: data.unit_no,
        status: "INVALID",
        reason: "unit_no is invalid after removing prefix/tower code.",
      });
      continue;
    }

    const cachedProject = projectCache.get(projectCode);
    let project = cachedProject === undefined
      ? await db.project.findUnique({ where: { code: projectCode }, select: { id: true } })
      : cachedProject;
    if (cachedProject === undefined) {
      projectCache.set(projectCode, project ?? null);
    }
    if (!project) {
      rows.push({
        rowNumber,
        projectCode,
        towerCode,
        prefix,
        unitNoRaw: data.unit_no,
        unitNoNormalized: normalizedUnitNo,
        displayLabel,
        status: "INVALID",
        reason: `project_code "${projectCode}" not found.`,
      });
      continue;
    }

    const cachedTower = towerCache.get(cacheTowerKey);
    let tower =
      cachedTower === undefined
        ? await db.tower.findUnique({
            where: { projectId_code: { projectId: project.id, code: towerCode } },
            select: { id: true },
          })
        : cachedTower;
    if (cachedTower === undefined) {
      towerCache.set(cacheTowerKey, tower ?? null);
    }
    if (!tower) {
      rows.push({
        rowNumber,
        projectCode,
        towerCode,
        prefix,
        unitNoRaw: data.unit_no,
        unitNoNormalized: normalizedUnitNo,
        displayLabel,
        status: "INVALID",
        reason: `tower_code "${towerCode}" not found under project "${projectCode}".`,
      });
      continue;
    }

    let categoryId: string | undefined;
    if (data.category_code) {
      const cachedCategory = categoryCache.get(data.category_code);
      const category =
        cachedCategory !== undefined
          ? cachedCategory
          : await db.unitCategory.findUnique({ where: { code: data.category_code }, select: { id: true } });
      if (cachedCategory === undefined) categoryCache.set(data.category_code, category ?? null);
      if (!category) {
        rows.push({
          rowNumber,
          projectCode,
          towerCode,
          prefix,
          unitNoRaw: data.unit_no,
          unitNoNormalized: normalizedUnitNo,
          displayLabel,
          status: "INVALID",
          reason: `category_code "${data.category_code}" not found.`,
        });
        continue;
      }
      categoryId = category.id;
    }

    let facingTypeId: string | undefined;
    if (data.facing_code) {
      const cachedFacing = facingCache.get(data.facing_code);
      const facing =
        cachedFacing !== undefined
          ? cachedFacing
          : await db.facingType.findUnique({ where: { code: data.facing_code }, select: { id: true } });
      if (cachedFacing === undefined) facingCache.set(data.facing_code, facing ?? null);
      if (!facing) {
        rows.push({
          rowNumber,
          projectCode,
          towerCode,
          prefix,
          unitNoRaw: data.unit_no,
          unitNoNormalized: normalizedUnitNo,
          displayLabel,
          status: "INVALID",
          reason: `facing_code "${data.facing_code}" not found.`,
        });
        continue;
      }
      facingTypeId = facing.id;
    }

    const dedupeKey = `${project.id}::${tower.id}::${normalizedUnitNo}`;
    if (seenInFile.has(dedupeKey)) {
      rows.push({
        rowNumber,
        projectCode,
        towerCode,
        prefix,
        unitNoRaw: data.unit_no,
        unitNoNormalized: normalizedUnitNo,
        displayLabel,
        status: "DUPLICATE",
        reason: "Duplicate row in uploaded file.",
      });
      continue;
    }
    seenInFile.add(dedupeKey);

    const exists = await db.unit.findUnique({
      where: {
        projectId_towerId_unitNo: {
          projectId: project.id,
          towerId: tower.id,
          unitNo: normalizedUnitNo,
        },
      },
      select: { id: true },
    });
    if (exists) {
      rows.push({
        rowNumber,
        projectCode,
        towerCode,
        prefix,
        unitNoRaw: data.unit_no,
        unitNoNormalized: normalizedUnitNo,
        displayLabel,
        status: "DUPLICATE",
        reason: "Already exists in database.",
      });
      continue;
    }

    rows.push({
      rowNumber,
      projectCode,
      towerCode,
      prefix,
      unitNoRaw: data.unit_no,
      unitNoNormalized: normalizedUnitNo,
      displayLabel,
      status: "NEW",
      reason: "Ready to import.",
    });

    importableRows.push({
      projectId: project.id,
      towerId: tower.id,
      prefix: prefix || null,
      unitNo: normalizedUnitNo,
      floorNo: parseOptionalInt(data.floor_no ?? ""),
      unitKind: data.unit_kind,
      categoryId: categoryId ?? null,
      facingTypeId: facingTypeId ?? null,
      areaSqft: data.area_sqft,
      rooms: data.rooms ?? null,
      listingStatus: data.listing_status,
      serialNo: data.serial_no ?? null,
      basePrice: data.base_price ?? null,
      transferCharges: data.transfer_charges ?? null,
    });
  }

  return { rows, importableRows };
}

export async function analyzeUnitsCsvAction(formData: FormData): Promise<UnitImportAnalysisResult> {
  try {
    const file = formData.get("csvFile");
    if (!(file instanceof File)) {
      return {
        ok: false,
        message: "Please upload a CSV file.",
        rows: [],
        importableCount: 0,
        duplicateCount: 0,
        invalidCount: 0,
        importPayload: "[]",
      };
    }

    const { rows, importableRows } = await analyzeCsvFromFile(file);
    const importableCount = rows.filter((row) => row.status === "NEW").length;
    const duplicateCount = rows.filter((row) => row.status === "DUPLICATE").length;
    const invalidCount = rows.filter((row) => row.status === "INVALID").length;

    if (rows.length === 0) {
      return {
        ok: false,
        message: "No rows found in CSV.",
        rows,
        importableCount,
        duplicateCount,
        invalidCount,
        importPayload: "[]",
      };
    }

    if (importableCount === 0) {
      return {
        ok: false,
        message: "Analysis complete. No new rows to import.",
        rows,
        importableCount,
        duplicateCount,
        invalidCount,
        importPayload: "[]",
      };
    }

    return {
      ok: true,
      message: `Analysis complete: ${importableCount} new, ${duplicateCount} duplicate, ${invalidCount} invalid.`,
      rows,
      importableCount,
      duplicateCount,
      invalidCount,
      importPayload: JSON.stringify(importableRows),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unable to analyze CSV.",
      rows: [],
      importableCount: 0,
      duplicateCount: 0,
      invalidCount: 0,
      importPayload: "[]",
    };
  }
}

export async function importUnitsCsvAction(importPayload: string): Promise<UnitImportActionState> {
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(importPayload);
  } catch {
    return { ok: false, message: "Invalid import payload." };
  }

  const validated = importPayloadSchema.safeParse(parsedPayload);
  if (!validated.success) {
    return { ok: false, message: "Import payload validation failed." };
  }
  if (validated.data.length === 0) {
    return { ok: false, message: "No new rows to import." };
  }

  let processed = 0;
  let skippedDuplicates = 0;

  for (const row of validated.data) {
    try {
      await db.unit.create({
        data: {
          projectId: row.projectId,
          towerId: row.towerId,
          prefix: row.prefix,
          unitNo: row.unitNo,
          floorNo: row.floorNo,
          unitKind: row.unitKind,
          categoryId: row.categoryId,
          facingTypeId: row.facingTypeId,
          areaSqft: row.areaSqft,
          rooms: row.rooms,
          listingStatus: row.listingStatus,
          serialNo: row.serialNo,
          basePrice: row.basePrice,
          transferCharges: row.transferCharges,
        },
      });
      processed += 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skippedDuplicates += 1;
        continue;
      }
      return {
        ok: false,
        message: `Import failed after ${processed} row(s).`,
      };
    }
  }

  if (processed === 0) {
    return {
      ok: false,
      message: skippedDuplicates > 0 ? "All selected rows already exist." : "No rows were imported.",
    };
  }

  if (skippedDuplicates > 0) {
    return {
      ok: true,
      message: `Imported ${processed} new row(s). Skipped ${skippedDuplicates} duplicate row(s).`,
      processed,
    };
  }

  return {
    ok: true,
    message: `Imported ${processed} new row(s) successfully.`,
    processed,
  };
}
