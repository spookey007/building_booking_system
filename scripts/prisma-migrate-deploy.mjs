/**
 * Apply Prisma migrations over Neon HTTPS (same path as db:ping).
 * Use when `prisma migrate deploy` fails with P1001 (TCP port 5432 blocked).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

function listMigrationFolders() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      const dir = path.join(MIGRATIONS_DIR, name);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "migration.sql"));
    })
    .sort();
}

function migrationChecksum(sqlText) {
  return crypto.createHash("sha256").update(sqlText).digest("hex");
}

async function loadAppliedMigrations(sql) {
  try {
    return await sql`
      SELECT migration_name, checksum
      FROM _prisma_migrations
      WHERE rolled_back_at IS NULL
    `;
  } catch (error) {
    if (String(error?.message ?? "").includes("_prisma_migrations")) {
      return [];
    }
    throw error;
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing in .env");
  }

  const sql = neon(connectionString);
  const folders = listMigrationFolders();
  const applied = await loadAppliedMigrations(sql);
  const appliedByName = new Map(applied.map((row) => [row.migration_name, row.checksum]));

  console.log(`Loaded Prisma migrations from ${path.relative(process.cwd(), MIGRATIONS_DIR)}.`);
  console.log(`${folders.length} migrations found in prisma/migrations\n`);

  const pending = [];
  for (const folder of folders) {
    const sqlPath = path.join(MIGRATIONS_DIR, folder, "migration.sql");
    const migrationSql = fs.readFileSync(sqlPath, "utf8");
    const checksum = migrationChecksum(migrationSql);
    const existing = appliedByName.get(folder);

    if (existing) {
      if (existing !== checksum) {
        console.warn(
          `Warning: checksum mismatch for "${folder}" (already applied; migration.sql was edited after deploy).`,
        );
      }
      continue;
    }

    pending.push({ folder, migrationSql, checksum });
  }

  if (pending.length === 0) {
    console.log("No pending migrations to apply.");
    console.log("Database schema is up to date!");
    return;
  }

  for (const migration of pending) {
    const startedAt = new Date();
    console.log(`Applying migration \`${migration.folder}\` …`);

    await sql.transaction(async (tx) => {
      await tx.unsafe(migration.migrationSql);
      await tx`
        INSERT INTO _prisma_migrations (
          id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count
        ) VALUES (
          ${randomUUID()},
          ${migration.checksum},
          ${new Date().toISOString()},
          ${migration.folder},
          NULL,
          NULL,
          ${startedAt.toISOString()},
          1
        )
      `;
    });

    console.log(`Applied \`${migration.folder}\``);
  }

  console.log(`\nAll migrations have been successfully applied.`);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
