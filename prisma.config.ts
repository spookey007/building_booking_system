import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma CLI (migrate, db push) uses TCP port 5432. Neon pooler often works when direct does not.
// The app runtime uses DATABASE_URL via Neon's HTTPS driver (see scripts/lib/pg-connection.mjs).
const migrateUrl = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!migrateUrl) {
  throw new Error("Set DATABASE_URL or MIGRATE_DATABASE_URL in .env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: migrateUrl,
  },
});
