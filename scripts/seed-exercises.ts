/**
 * Loads the global exercise library (db/seed/exercises.json) into the
 * database. Safe to re-run: rows are upserted by id. Uses the table-owner
 * connection because global rows (gym_id NULL) are read-only for the app.
 *
 *   DATABASE_ADMIN_URL=postgres://... npm run db:seed-exercises
 */
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

type Row = {
  id: string;
  name: string;
  category: string;
  equipment: string;
  level: string;
  mechanic: string | null;
  force: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  images: string[];
  riskTags: string[];
};

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
  const rows: Row[] = JSON.parse(await readFile("db/seed/exercises.json", "utf8"));
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const values: unknown[] = [];
      const tuples = chunk.map((r, j) => {
        const b = j * 12;
        values.push(r.id, r.name, r.category, r.equipment, r.level, r.mechanic, r.force, r.primaryMuscles, r.secondaryMuscles, r.instructions, r.images, r.riskTags);
        return `($${b + 1},null,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`;
      });
      await client.query(
        `insert into exercises (id, gym_id, name, category, equipment, level, mechanic, force, primary_muscles, secondary_muscles, instructions, images, risk_tags)
         values ${tuples.join(",")}
         on conflict (id) do update set name = excluded.name, category = excluded.category, equipment = excluded.equipment,
           level = excluded.level, mechanic = excluded.mechanic, force = excluded.force, primary_muscles = excluded.primary_muscles,
           secondary_muscles = excluded.secondary_muscles, instructions = excluded.instructions, images = excluded.images,
           risk_tags = excluded.risk_tags`,
        values,
      );
    }
    await client.query("commit");
    console.log(`Seeded ${rows.length} exercises.`);
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
