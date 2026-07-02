import "dotenv/config";
import {
  createPrismaClient,
  normalizeDatabaseUrl,
  printDbTroubleshooting,
  withDbRetry,
} from "./lib/pg-connection.mjs";

const url = normalizeDatabaseUrl(process.env.DATABASE_URL);
const viaNeon = url.includes(".neon.tech") ? "Neon HTTPS" : "PostgreSQL TCP";
console.log(`Pinging (${viaNeon}) ${url.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")} …`);

const prisma = createPrismaClient(url);
const started = Date.now();

try {
  const result = await withDbRetry(() =>
    prisma.$queryRaw`SELECT current_database()::text AS db, NOW() AS ts`,
  );
  console.log(`Connected in ${((Date.now() - started) / 1000).toFixed(1)}s:`, result);
} catch (error) {
  printDbTroubleshooting(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
