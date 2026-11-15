/**
 * Applies SQL migrations in db/migrations using the table-owner connection
 * (DATABASE_ADMIN_URL). The running app never uses this connection.
 *
 *   DATABASE_ADMIN_URL=postgres://... npm run db:migrate
 */
import { applyMigrations } from "./lib/db-tasks";

async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL is not set");
  await applyMigrations(url);
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
