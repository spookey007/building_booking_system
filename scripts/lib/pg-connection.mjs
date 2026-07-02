import dns from "node:dns";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import ws from "ws";

dns.setDefaultResultOrder("ipv4first");

function isNeonUrl(rawUrl) {
  try {
    return new URL(rawUrl).hostname.includes(".neon.tech");
  } catch {
    return false;
  }
}

/** Strip params that break Neon/Node drivers; keep host as copied from Neon console. */
export function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error("DATABASE_URL environment variable is missing");
  }

  const url = new URL(rawUrl);
  url.searchParams.delete("channel_binding");
  url.searchParams.delete("connect_timeout");
  if (!url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

function parsePgConfig(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete("channel_binding");

  const sslRequired =
    url.searchParams.get("sslmode") === "require" ||
    url.searchParams.get("sslmode") === "verify-full" ||
    url.hostname.includes(".neon.tech");

  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 60_000,
    max: 10,
  };
}

function createNeonAdapter(connectionString) {
  neonConfig.webSocketConstructor = ws;
  // Prefer HTTPS fetch (port 443) — works when Windows blocks Node on TCP 5432/WebSocket.
  neonConfig.poolQueryViaFetch = true;
  return new PrismaNeon({ connectionString: normalizeDatabaseUrl(connectionString) });
}

function createPgAdapter(connectionString) {
  const pool = new pg.Pool(parsePgConfig(connectionString));
  return new PrismaPg(pool);
}

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is missing");
  }

  const adapter = isNeonUrl(connectionString)
    ? createNeonAdapter(connectionString)
    : createPgAdapter(connectionString);

  return new PrismaClient({ adapter });
}

export async function withDbRetry(fn, { attempts = 3, delayMs = 2000, label = "database" } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable =
        error?.code === "ETIMEDOUT" ||
        error?.code === "ECONNREFUSED" ||
        error?.code === "ENOTFOUND" ||
        String(error?.message ?? "").includes("fetch failed") ||
        String(error?.message ?? "").includes("timeout") ||
        String(error?.message ?? "").includes("Connection terminated");

      if (!retryable || attempt === attempts) {
        break;
      }

      console.warn(
        `[${label}] attempt ${attempt}/${attempts} failed (${error.code ?? error.message}). Retrying in ${delayMs / 1000}s…`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export function printDbTroubleshooting(error) {
  console.error("\nDatabase connection failed.");
  const detail = [error?.code, error?.message].filter(Boolean).join(" ") || error?.stack || String(error);
  console.error(`Error: ${detail}`);
  console.error(`
Neon cloud troubleshooting:
  1. Copy a fresh connection string from https://console.neon.tech → Connect → Node.js
  2. Wake/resume the project if it is suspended (free tier sleeps when idle)
  3. Paste into .env as DATABASE_URL (direct or pooled URL both work via WebSocket)
  4. First connect after sleep can take 15–30 seconds — wait for db:ping to finish
`);
}
