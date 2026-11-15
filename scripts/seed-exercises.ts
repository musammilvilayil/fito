/**
 * Loads the global exercise library (db/seed/exercises.json) into the
 * database. Safe to re-run: rows are upserted by id. Uses the table-owner
 * connection because global rows (gym_id NULL) are read-only for the app.
 *
 *   DATABASE_ADMIN_URL=postgres://... npm run db:seed-exercises
 */
import { seedExerciseLibrary } from "./lib/db-tasks";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
  console.log(`Seeded ${await seedExerciseLibrary(url)} exercises.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
