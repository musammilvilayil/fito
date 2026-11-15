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

/**
 * Runs tasks one after another and returns their results like Promise.all.
 * A transaction is one connection, which runs one query at a time, so
 * Promise.all over the same `tx` gains nothing; pg deprecates it and pg 9
 * will reject it.
 */
export async function sequential<T extends readonly unknown[]>(...tasks: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as unknown as T;
}
