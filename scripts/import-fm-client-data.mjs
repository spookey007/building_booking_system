import "dotenv/config";

/**
 * Import FM Towers client CSVs (from parse-client-pdfs.mjs) into existing schema.
 *
 * Usage:
 *   npm run import:client-data                    # units + sold bookings + opening Receive totals
 *   npm run import:client-data -- --with-receipts # also import slip entries (may double-count)
 *   npm run import:client-data -- --receipts-only # slips only, no sold/units
 *
 * Requires: npm run prisma:seed (admin user + lookups)
 */
import fs from "node:fs";
import path from "node:path";
import {
  createPrismaClient,
  normalizeDatabaseUrl,
  printDbTroubleshooting,
  withDbRetry,
} from "./lib/pg-connection.mjs";
import { syncUnitListingFromBookings } from "./sync-fm-data.mjs";

const IMPORT_DIR = path.join(process.cwd(), "data", "import");
const args = new Set(process.argv.slice(2));
const withReceipts = args.has("--with-receipts");
const receiptsOnly = args.has("--receipts-only");

const prisma = createPrismaClient(normalizeDatabaseUrl(process.env.DATABASE_URL));

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}. Run: npm run parse:client-pdfs`);
  }
  const text = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        values.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    values.push(cur);
    const row = {};
    for (let j = 0; j < headers.length; j += 1) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseMoney(v) {
  if (!v) return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  if (!value) return new Date();
  const ddmmyy = value.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (ddmmyy) {
    let year = Number(ddmmyy[3]);
    year += year >= 70 ? 1900 : 2000;
    return new Date(Date.UTC(year, Number(ddmmyy[2]) - 1, Number(ddmmyy[1])));
  }
  const ddmmyyyy = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(
      Date.UTC(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1])),
    );
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function ledgerTypeFromRaw(raw) {
  const key = String(raw ?? "").toUpperCase();
  if (key === "UNOFFICIAL") return "UNOFFICIAL";
  if (key === "UTILITY") return "UTILITY";
  if (key === "PARKING") return "PARKING";
  return "OFFICIAL";
}

function paymentModeFromRaw(raw) {
  const key = String(raw ?? "").toUpperCase();
  if (key === "CHEQUE") return "CHEQUE";
  if (key === "ONLINE") return "ONLINE";
  return "CASH";
}

function unitKey(tower, unitNo) {
  return `${tower}:${unitNo.toUpperCase()}`;
}

async function ensureLookups() {
  const project = await prisma.project.findUnique({ where: { code: "FM01" } });
  if (!project) throw new Error("Project FM01 missing. Run npm run prisma:seed first.");

  const admin = await prisma.user.findFirst({ where: { email: "admin@builder.local" } });
  if (!admin) throw new Error("Admin user missing. Run npm run prisma:seed first.");

  const towers = {};
  for (const code of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
    const tower = await prisma.tower.upsert({
      where: { projectId_code: { projectId: project.id, code } },
      update: { isActive: true },
      create: { projectId: project.id, code, name: `Tower ${code}`, isActive: true },
    });
    towers[code] = tower;
  }

  const categories = {};
  for (const code of ["GOLD", "PLATINUM", "SILVER"]) {
    categories[code] = await prisma.unitCategory.upsert({
      where: { code },
      update: {},
      create: { code, name: code.charAt(0) + code.slice(1).toLowerCase() },
    });
  }

  const facings = {};
  for (const code of ["WEST_OPEN", "PARK", "EAST_OPEN", "NAVY_MERCHANT", "HIGHWAY"]) {
    facings[code] = await prisma.facingType.findUnique({ where: { code } });
  }

  return { project, admin, towers, categories, facings };
}

async function importUnits(ctx) {
  const rows = readCsv(path.join(IMPORT_DIR, "units.csv"));
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const tower = ctx.towers[row.tower_code];
    if (!tower) continue;

    const category = row.category_code ? ctx.categories[row.category_code] : null;
    const facing = row.facing_code ? ctx.facings[row.facing_code] : null;
    const unitNo = row.unit_no.toUpperCase();

    const data = {
      projectId: ctx.project.id,
      towerId: tower.id,
      unitNo,
      floorNo: row.floor_no ? Number(row.floor_no) : null,
      unitKind: row.unit_kind || "RESIDENTIAL",
      categoryId: category?.id ?? null,
      facingTypeId: facing?.id ?? null,
      areaSqft: parseMoney(row.area_sqft) ?? 0,
      rooms: row.rooms ? Number(row.rooms) : null,
      listingStatus: row.listing_status || "AVAILABLE",
      serialNo: row.serial_no ? Number(row.serial_no) : null,
      notes: "[client-import]",
    };

    const existing = await prisma.unit.findFirst({
      where: { projectId: ctx.project.id, towerId: tower.id, unitNo },
    });

    if (existing) {
      await prisma.unit.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.unit.create({ data });
      created += 1;
    }
  }

  console.log(`Units: ${created} created, ${updated} updated (${rows.length} CSV rows)`);
}

async function importSoldBookings(ctx) {
  const rows = readCsv(path.join(IMPORT_DIR, "sold-bookings.csv"));
  let bookings = 0;
  let customers = 0;

  for (const row of rows) {
    const tower = ctx.towers[row.tower_code];
    if (!tower) continue;

    const unitNo = row.unit_no.toUpperCase();
    let unit = await prisma.unit.findFirst({
      where: { projectId: ctx.project.id, towerId: tower.id, unitNo },
    });

    if (!unit) {
      unit = await prisma.unit.create({
        data: {
          projectId: ctx.project.id,
          towerId: tower.id,
          unitNo,
          floorNo: row.floor_no ? Number(row.floor_no) : null,
          unitKind: "RESIDENTIAL",
          categoryId: ctx.categories[row.category_code]?.id ?? null,
          areaSqft: parseMoney(row.size_sqft) ?? 0,
          listingStatus: "SOLD",
          notes: "[client-import] auto-created from sold report",
        },
      });
    } else {
      await prisma.unit.update({ where: { id: unit.id }, data: { listingStatus: "SOLD" } });
    }

    let customer = await prisma.customer.findFirst({
      where: { fullName: { equals: row.customer_name, mode: "insensitive" } },
    });
    if (!customer) {
      customer = await prisma.customer.create({
        data: { fullName: row.customer_name },
      });
      customers += 1;
    }

    const bookingNo = `FM-${row.tower_code}-${unitNo}`;
    const bookingDate = parseDate(row.booking_date);
    const rate = parseMoney(row.rate) ?? 0;
    const utility = parseMoney(row.utility) ?? 0;
    const parking = parseMoney(row.parking) ?? 0;
    const total = parseMoney(row.total) ?? rate + utility + parking;
    const received = parseMoney(row.received) ?? 0;

    const booking = await prisma.booking.upsert({
      where: { bookingNo },
      update: {
        status: received >= total && total > 0 ? "COMPLETED" : "CONFIRMED",
        unitPrice: rate,
        addonUtility: utility,
        addonParking: parking,
        grossTotal: total,
        payableCost: total,
        bookingDate,
      },
      create: {
        bookingNo,
        projectId: ctx.project.id,
        unitId: unit.id,
        customerId: customer.id,
        bookedByUserId: ctx.admin.id,
        bookingDate,
        status: received >= total && total > 0 ? "COMPLETED" : "CONFIRMED",
        unitPrice: rate,
        addonUtility: utility,
        addonParking: parking,
        grossTotal: total,
        payableCost: total,
        notes: "[client-import]",
      },
    });

    bookings += 1;

    if (!receiptsOnly && received > 0) {
      const receivingNo = `OPEN-${bookingNo}`;
      const existingReceiving = await prisma.receiving.findUnique({ where: { receivingNo } });
      if (!existingReceiving) {
        const receiving = await prisma.receiving.create({
          data: {
            receivingNo,
            customerId: customer.id,
            receivedDate: bookingDate,
            totalAmount: received,
            mode: "CASH",
            notes: "[client-import] opening balance from sold report",
            allocations: {
              create: {
                bookingId: booking.id,
                amount: received,
                ledgerType: "OFFICIAL",
              },
            },
            payments: {
              create: {
                bookingId: booking.id,
                paymentDate: bookingDate,
                amount: received,
                mode: "CASH",
                ledgerType: "OFFICIAL",
                notes: "[client-import] opening balance",
              },
            },
          },
        });
        void receiving;
      }
    }
  }

  console.log(`Sold bookings: ${bookings} upserted, ${customers} new customers`);
}

async function importReceipts(ctx) {
  const rows = readCsv(path.join(IMPORT_DIR, "receipts.csv"));
  let imported = 0;
  let skipped = 0;
  let bookingsCreated = 0;

  const bookingByUnit = new Map();
  const bookings = await prisma.booking.findMany({
    where: { project: { code: "FM01" } },
    include: { unit: { include: { tower: true } }, customer: true },
  });
  for (const b of bookings) {
    bookingByUnit.set(unitKey(b.unit.tower.code, b.unit.unitNo), b);
  }

  async function ensureBookingForReceipt(row, customer) {
    const key = unitKey(row.tower_code, row.unit_no);
    let booking = bookingByUnit.get(key);
    if (booking) return booking;

    const tower = ctx.towers[row.tower_code];
    if (!tower) return null;

    const unitNo = row.unit_no.toUpperCase();
    let unit = await prisma.unit.findFirst({
      where: { projectId: ctx.project.id, towerId: tower.id, unitNo },
    });
    if (!unit) return null;

    const bookingNo = `FM-${row.tower_code}-${unitNo}`;
    const receivedDate = parseDate(row.received_date);
    booking = await prisma.booking.upsert({
      where: { bookingNo },
      update: { customerId: customer.id },
      create: {
        bookingNo,
        projectId: ctx.project.id,
        unitId: unit.id,
        customerId: customer.id,
        bookedByUserId: ctx.admin.id,
        bookingDate: receivedDate,
        status: "CONFIRMED",
        payableCost: 0,
        notes: "[client-import] created from receipt slip",
      },
      include: { unit: { include: { tower: true } }, customer: true },
    });

    await prisma.unit.update({
      where: { id: unit.id },
      data: { listingStatus: "SOLD" },
    });

    bookingByUnit.set(key, booking);
    bookingsCreated += 1;
    return booking;
  }

  for (const row of rows) {
    const key = unitKey(row.tower_code, row.unit_no);
    let booking = bookingByUnit.get(key);

    let customer =
      booking?.customer ??
      (await prisma.customer.findFirst({
        where: { fullName: { equals: row.customer_name, mode: "insensitive" } },
      }));

    if (!customer) {
      customer = await prisma.customer.create({
        data: { fullName: row.customer_name },
      });
    }

    if (!booking) {
      booking = await ensureBookingForReceipt(row, customer);
    }

    if (!booking) {
      skipped += 1;
      continue;
    }

    const receivedDate = parseDate(row.received_date);
    const amount = parseMoney(row.amount);
    if (!amount || amount <= 0) {
      skipped += 1;
      continue;
    }

    const receivingNo = `SLIP-${row.tower_code}-${row.unit_no}-${row.slip_no || imported}-${receivedDate.toISOString().slice(0, 10)}`;
    const exists = await prisma.receiving.findUnique({ where: { receivingNo } });
    if (exists) {
      skipped += 1;
      continue;
    }

    await prisma.receiving.create({
      data: {
        receivingNo,
        customerId: customer.id,
        receivedDate,
        totalAmount: amount,
        mode: paymentModeFromRaw(row.payment_mode),
        chequeNo: row.cheque_no || null,
        chequeBank: row.bank_name || null,
        chequeDate: row.cheque_date ? parseDate(row.cheque_date) : null,
        notes: `[client-import] ${row.on_account_of || "slip entry"}`,
        allocations: {
          create: {
            bookingId: booking.id,
            amount,
            ledgerType: ledgerTypeFromRaw(row.ledger_type),
          },
        },
        payments: {
          create: {
            bookingId: booking.id,
            paymentDate: receivedDate,
            amount,
            mode: paymentModeFromRaw(row.payment_mode),
            ledgerType: ledgerTypeFromRaw(row.ledger_type),
            referenceNo: row.slip_no || null,
            notes: row.on_account_of || null,
          },
        },
      },
    });
    imported += 1;
  }

  console.log(`Receipt slips: ${imported} imported, ${skipped} skipped, ${bookingsCreated} bookings created from slips`);
}

async function main() {
  await withDbRetry(async () => {
    const ctx = await ensureLookups();

    if (!receiptsOnly) {
      await importUnits(ctx);
      await importSoldBookings(ctx);
    }

    if (withReceipts || receiptsOnly) {
      await importReceipts(ctx);
    } else {
      console.log("Receipt slips skipped (use --with-receipts to import slip entries; avoid double-count with sold Receive totals).");
    }

    const sync = await syncUnitListingFromBookings();
    console.log(`Unit sync: ${sync.unitsUpdated} unit(s) aligned to ${sync.bookings} active booking(s).`);

    console.log("Client data import complete.");
  }, { label: "import" });
}

main()
  .catch((error) => {
    printDbTroubleshooting(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
