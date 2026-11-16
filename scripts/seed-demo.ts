/**
 * Creates (or refreshes) the demo gym for sales demos. See scripts/demo-seed.ts.
 *
 *   npm run db:seed-demo
 *   npm run db:seed-demo -- --name "Kochi Fitness Hub" --owner "Sajan Mathew" --password "something-long"
 *
 * Needs DATABASE_URL (fito_app) and DATABASE_ADMIN_URL (owner), from the
 * environment or .env.local. On an https APP_URL (a live server) it refuses
 * unless you add --confirm: demo data is best kept on a separate demo
 * deployment.
 *
 * Names, phone numbers and addresses are invented. Phone numbers use the
 * +91 90000 xxxxx pattern but may still belong to someone: don't send
 * WhatsApp messages from the demo gym.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { pool } from "../src/server/db/client";
import { seedDemo } from "./demo-seed";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const { values: args } = parseArgs({
  options: {
    name: { type: "string", default: "FITO Demo Gym" },
    owner: { type: "string", default: "Arun Kumar" },
    password: { type: "string", default: "demo1234" },
    confirm: { type: "boolean", default: false },
  },
});

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL) {
    throw new Error("Set DATABASE_URL (fito_app) and DATABASE_ADMIN_URL (owner), or create .env.local.");
  }
  // GitHub Codespaces are development machines even though their address is https.
  if ((process.env.APP_URL ?? "").startsWith("https://") && !args.confirm && process.env.CODESPACES !== "true") {
    throw new Error("APP_URL is https, so this looks like a live server. Keep demo data on a separate demo deployment, or re-run with --confirm.");
  }
  try {
    const r = await seedDemo({ name: args.name, owner: args.owner, password: args.password, adminUrl: process.env.DATABASE_ADMIN_URL });
    const c = r.counts;
    if (r.replaced) console.log("Replaced the previous demo gym.");
    console.log(`
Demo gym ready: ${r.name} (marked as demo data)
  ${c.members} members, ${c.memberships} memberships, ${c.payments} payments, ${c.checkins} check-ins,
  ${c.plans} workout plans, ${c.logs} workout logs, ${c.weighins} weigh-ins (last ${r.days} days up to ${r.today})

Sign in at /login with password "${args.password}":
  Owner    ${r.logins.owner}   (or 90000 00001)
  Trainer  ${r.logins.trainer} (or 90000 00002)
  Desk     ${r.logins.desk}    (or 90000 00003, front desk)
  Member   ${r.logins.member}  (${r.demoMemberName}, member app)
`);
  } finally {
    await pool().end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
