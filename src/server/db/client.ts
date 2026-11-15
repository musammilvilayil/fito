import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type Cache = { pool?: Pool; db?: Database };
const globalCache = globalThis as unknown as { __fitoDb?: Cache };
const cache: Cache = (globalCache.__fitoDb ??= {});

/** Shared connection pool, cached across hot reloads in development. */
export function pool(): Pool {
  if (!cache.pool) {
    const e = env();
    cache.pool = new Pool({
      connectionString: e.DATABASE_URL,
      max: e.DATABASE_POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return cache.pool;
}

export function db(): Database {
  if (!cache.db) cache.db = drizzle(pool(), { schema });
  return cache.db;
}
