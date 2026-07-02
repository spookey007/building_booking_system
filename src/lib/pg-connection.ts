import dns from "node:dns";
import { neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import ws from "ws";

dns.setDefaultResultOrder("ipv4first");

function isNeonUrl(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname.includes(".neon.tech");
  } catch {
    return false;
  }
}

export function normalizeDatabaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.searchParams.delete("channel_binding");
  url.searchParams.delete("connect_timeout");
  if (!url.searchParams.has("sslmode")) {
    url.searchParams.set("sslmode", "require");
  }
  return url.toString();
}

function parsePgConfig(rawUrl: string): pg.PoolConfig {
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

export function createDatabaseAdapter(connectionString: string) {
  if (isNeonUrl(connectionString)) {
    neonConfig.webSocketConstructor = ws;
    neonConfig.poolQueryViaFetch = true;
    return new PrismaNeon({ connectionString: normalizeDatabaseUrl(connectionString) });
  }

  const pool = new pg.Pool(parsePgConfig(connectionString));
  return new PrismaPg(pool);
}
