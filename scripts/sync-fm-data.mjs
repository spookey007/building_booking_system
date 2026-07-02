import "dotenv/config";

/**
 * Sync unit listing status from active bookings and report portfolio counts.
 *
 * Usage: npm run sync:client-data
 */
import {
  createPrismaClient,
  normalizeDatabaseUrl,
  printDbTroubleshooting,
  withDbRetry,
} from "./lib/pg-connection.mjs";

const prisma = createPrismaClient(normalizeDatabaseUrl(process.env.DATABASE_URL));

export async function syncUnitListingFromBookings() {
  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: {
      id: true,
      unitId: true,
      status: true,
      notes: true,
      bookingNo: true,
    },
  });

  let updated = 0;
  for (const booking of bookings) {
    const imported =
      booking.notes?.includes("[client-import]") || booking.bookingNo.startsWith("FM-");
    const target =
      imported || booking.status === "COMPLETED" ? "SOLD" : "BOOKED";

    const result = await prisma.unit.updateMany({
      where: { id: booking.unitId, listingStatus: { not: target } },
      data: { listingStatus: target },
    });
    updated += result.count;
  }

  return { bookings: bookings.length, unitsUpdated: updated };
}

async function printPortfolioStats() {
  const [unitStatus, bookingStatus, payments, customersWithBookings] = await Promise.all([
    prisma.unit.groupBy({ by: ["listingStatus"], _count: { _all: true } }),
    prisma.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.payment.count({ where: { voidedAt: null } }),
    prisma.booking.groupBy({
      by: ["customerId"],
      where: { status: { notIn: ["CANCELLED", "MERGED", "TRANSFERRED", "SWITCHED"] } },
      _count: { _all: true },
    }),
  ]);

  console.log("Portfolio after sync:");
  console.log("  Units:", Object.fromEntries(unitStatus.map((r) => [r.listingStatus, r._count._all])));
  console.log("  Bookings:", Object.fromEntries(bookingStatus.map((r) => [r.status, r._count._all])));
  console.log("  Payments:", payments);
  console.log("  Customers with active bookings:", customersWithBookings.length);
}

async function main() {
  await withDbRetry(async () => {
    const result = await syncUnitListingFromBookings();
    console.log(
      `Synced ${result.unitsUpdated} unit(s) from ${result.bookings} active booking(s).`,
    );
    await printPortfolioStats();
  }, { label: "sync" });
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("sync-fm-data.mjs");
if (isDirectRun) {
  main()
    .catch((error) => {
      printDbTroubleshooting(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
