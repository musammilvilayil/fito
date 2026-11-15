import { readFileSync } from "node:fs";
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
  // Truncating gyms cascades to exercises (FK), so reload the global library.
  await adminPool().query(`truncate ${list} restart identity cascade`);
  await seedExercises();
}

type SeedExercise = {
  id: string; name: string; category: string; equipment: string; level: string; mechanic: string | null; force: string | null;
  primaryMuscles: string[]; secondaryMuscles: string[]; instructions: string[]; images: string[]; riskTags: string[];
};
let seedRows: SeedExercise[] | undefined;

async function seedExercises() {
  const { rows } = await adminPool().query<{ n: number }>("select count(*)::int as n from exercises where gym_id is null");
  if (rows[0]!.n > 0) return;
  seedRows ??= JSON.parse(readFileSync("db/seed/exercises.json", "utf8")) as SeedExercise[];
  const col = <K extends keyof SeedExercise>(k: K) => seedRows!.map((r) => r[k]);
  const arr = (k: "primaryMuscles" | "secondaryMuscles" | "instructions" | "images" | "riskTags") => seedRows!.map((r) => JSON.stringify(r[k]));
  await adminPool().query(
    `insert into exercises (id, gym_id, name, category, equipment, level, mechanic, force, primary_muscles, secondary_muscles, instructions, images, risk_tags)
     select id, null, name, category, equipment, level, mechanic, force,
       array(select jsonb_array_elements_text(pm)), array(select jsonb_array_elements_text(sm)),
       array(select jsonb_array_elements_text(ins)), array(select jsonb_array_elements_text(img)), array(select jsonb_array_elements_text(rt))
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::jsonb[], $9::jsonb[], $10::jsonb[], $11::jsonb[], $12::jsonb[])
       as t(id, name, category, equipment, level, mechanic, force, pm, sm, ins, img, rt)`,
    [col("id"), col("name"), col("category"), col("equipment"), col("level"), col("mechanic"), col("force"), arr("primaryMuscles"), arr("secondaryMuscles"), arr("instructions"), arr("images"), arr("riskTags")],
  );
}

export const meta = { ip: "127.0.0.1", userAgent: "vitest" };

let seq = 0;
const runPrefix = String(100 + Math.floor(Math.random() * 900));
/** Unique valid Indian mobile number within this test process. */
export function uniquePhone(): string {
  seq += 1;
  return `+919${runPrefix}${String(seq).padStart(6, "0")}`;
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
