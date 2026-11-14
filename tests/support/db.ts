import { Pool } from "pg";
import { resolveGymContext, type GymContext } from "@/server/auth/context";
import { resolveSession } from "@/server/auth/session";
import { registerGymOwner } from "@/server/modules/auth/service";

let admin: Pool | undefined;

/** Owner connection for test setup only (bypasses row-level security). */
export function adminPool(): Pool {
  admin ??= new Pool({ connectionString: process.env.TEST_DATABASE_ADMIN_URL, max: 2 });
  return admin;
}

export async function resetDb() {
  const tables = await adminPool().query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename <> 'exercises'",
  );
  const list = tables.rows.map((r) => `"${r.tablename}"`).join(", ");
  await adminPool().query(`truncate ${list} restart identity cascade`);
  await adminPool().query("delete from exercises where gym_id is not null");
}

export const meta = { ip: "127.0.0.1", userAgent: "vitest" };

let seq = 0;
export function uniquePhone(): string {
  seq += 1;
  return `+9198${String(Date.now() % 100000).padStart(5, "0")}${String(seq).padStart(3, "0")}`;
}

/** Registers a new gym owner and returns their gym context. */
export async function newGym(name = "Test Gym") {
  const phone = uniquePhone();
  const reg = await registerGymOwner(
    { fullName: `${name} Owner`, email: null, phone, password: "password123", gymName: name, city: "Kochi", accessCode: null },
    meta,
  );
  const ctx = await contextFor(reg.token);
  return { ...reg, phone, ctx };
}

export async function contextFor(token: string, gymId?: string): Promise<GymContext> {
  const session = await resolveSession(token);
  if (!session) throw new Error("no session");
  const r = await resolveGymContext(session, gymId);
  if (r.kind !== "ok") throw new Error(`no gym context: ${r.kind}`);
  return r.ctx;
}
