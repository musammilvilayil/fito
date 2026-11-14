import "server-only";
import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { db } from "./client";
import type * as schema from "./schema";

export type Tx = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export type DbScope = { userId?: string | null; gymId?: string | null };

/**
 * Runs `fn` in a transaction with the tenant variables set. Row-level
 * security policies read app.user_id and app.gym_id, so every query inside
 * only sees the selected gym's rows. The settings are transaction-local.
 */
export async function withScope<T>(scope: DbScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${scope.userId ?? ""}, true), set_config('app.gym_id', ${scope.gymId ?? ""}, true)`,
    );
    return fn(tx);
  });
}

/** Changes the gym scope inside an open transaction (e.g. right after creating a gym). */
export async function setGymScope(tx: Tx, gymId: string) {
  await tx.execute(sql`select set_config('app.gym_id', ${gymId}, true)`);
}

export async function setUserScope(tx: Tx, userId: string) {
  await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
}
