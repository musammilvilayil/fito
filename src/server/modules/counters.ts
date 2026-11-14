import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "../db/tx";

/**
 * Gap-free per-gym sequence (receipt numbers, member codes). The upsert locks
 * the counter row until the transaction ends, so concurrent requests queue.
 */
export async function nextCounter(tx: Tx, gymId: string, name: string): Promise<number> {
  const result = await tx.execute(sql`
    insert into counters (gym_id, name, value) values (${gymId}, ${name}, 1)
    on conflict (gym_id, name) do update set value = counters.value + 1
    returning value
  `);
  return Number((result.rows[0] as { value: string | number }).value);
}
