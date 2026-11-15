import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { inGym } from "@/server/auth/context";
import { gymStaff, gyms } from "@/server/db/schema";
import { withScope } from "@/server/db/tx";
import { listStaff } from "@/server/modules/staff/service";
import { adminPool, newGym, resetDb } from "../support/db";

describe("database-level tenant isolation", () => {
  beforeEach(resetDb);

  it("has row-level security enabled on every table", async () => {
    const { rows } = await adminPool().query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`);
    const missing = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(missing).toEqual([]);
  });

  it("gives every table with gym_id a policy for the app role", async () => {
    const { rows } = await adminPool().query<{ table_name: string }>(`
      select distinct c.table_name from information_schema.columns c
      where c.table_schema = 'public' and c.column_name = 'gym_id'
        and not exists (select 1 from pg_policies p where p.tablename = c.table_name and 'fito_app' = any(p.roles))`);
    expect(rows.map((r) => r.table_name)).toEqual([]);
  });

  it("the app role cannot bypass row-level security", async () => {
    const { rows } = await adminPool().query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "select rolbypassrls, rolsuper from pg_roles where rolname = 'fito_app'",
    );
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it("hides one gym's rows from another even without a WHERE clause", async () => {
    const a = await newGym("Gym A");
    const b = await newGym("Gym B");

    // Deliberately unfiltered queries: RLS must still scope them.
    const seenByA = await withScope({ userId: a.ctx.user.id, gymId: a.ctx.gym.id }, (tx) => tx.select().from(gymStaff));
    expect(seenByA.map((s) => s.gymId)).toEqual([a.ctx.gym.id]);

    const gymsSeenByB = await withScope({ userId: b.ctx.user.id, gymId: b.ctx.gym.id }, (tx) => tx.select().from(gyms));
    expect(gymsSeenByB.map((g) => g.name)).toEqual(["Gym B"]);

    // Writing into another gym is rejected by the database.
    const err = await withScope({ userId: b.ctx.user.id, gymId: b.ctx.gym.id }, (tx) =>
      tx.insert(gymStaff).values({ gymId: a.ctx.gym.id, role: "trainer", fullName: "Intruder", phone: "+919999999999" }),
    ).catch((e) => e);
    expect(String(err?.cause ?? err)).toMatch(/row-level security/);

    // Updates against another gym's rows silently match nothing.
    const updated = await withScope({ userId: b.ctx.user.id, gymId: b.ctx.gym.id }, (tx) =>
      tx.execute(sql`update gym_staff set full_name = 'hacked' where gym_id = ${a.ctx.gym.id}`),
    );
    expect(updated.rowCount).toBe(0);

    const aStaff = await inGym(a.ctx, (tx) => listStaff(tx, a.ctx));
    expect(aStaff.every((s) => s.fullName !== "hacked")).toBe(true);
  });

  it("sees nothing when no gym is selected", async () => {
    await newGym("Gym A");
    const rows = await withScope({}, (tx) => tx.select().from(gymStaff));
    expect(rows).toEqual([]);
  });
});
