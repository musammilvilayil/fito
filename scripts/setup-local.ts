/**
 * One-step local setup on Windows, macOS or Linux:
 *
 *   npm run db:setup-local
 *
 * Needs PostgreSQL 15+ running on this computer. It signs in as a Postgres
 * superuser: "postgres" on localhost:5432 by default (on macOS with
 * Homebrew it also tries your own user name). Set PGHOST, PGPORT or PGUSER
 * to change that. If the user has a password it asks for it (or set
 * PGPASSWORD).
 *
 * Then it creates the `fito` and `fito_test` databases, applies migrations,
 * loads the exercise library, lets the app's database role (fito_app) sign
 * in, and writes .env.local if there isn't one. Safe to re-run.
 */
import { existsSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { createInterface, type Interface } from "node:readline";
import { Client } from "pg";
import { applyMigrations, seedExerciseLibrary } from "./lib/db-tasks";

const host = process.env.PGHOST ?? "localhost";
const port = Number(process.env.PGPORT ?? 5432);
const APP_DB_PASSWORD = process.env.FITO_APP_DB_PASSWORD ?? "fito_app_local";
const DATABASES = ["fito", "fito_test"];

const urlFor = (user: string, password: string, db: string) =>
  `postgres://${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@${host}:${port}/${db}`;

// One reader for the whole run, so typed-ahead input isn't lost between questions.
let reader: Interface | null = null;
let masking: { prompt: string } | null = null;

/** Asks a question on the terminal; hidden input for passwords. */
function ask(question: string, hidden = false): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve("");
  if (!reader) {
    reader = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const r = reader as unknown as { _writeToOutput: (s: string) => void };
    const write = r._writeToOutput.bind(reader);
    r._writeToOutput = (s: string) => write(masking && !s.startsWith(masking.prompt) ? s.replace(/[^\r\n]/g, "*") : s);
  }
  masking = hidden ? { prompt: question } : null;
  return new Promise((resolve) =>
    reader!.question(question, (answer) => {
      masking = null;
      resolve(answer);
    }),
  );
}

type PgError = Error & { code?: string };

async function connectAdmin(): Promise<{ user: string; password: string; client: Client }> {
  const candidates = process.env.PGUSER ? [process.env.PGUSER] : [...new Set(["postgres", userInfo().username])];
  let password = process.env.PGPASSWORD ?? "";
  for (const user of candidates) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const client = new Client({ host, port, user, password, database: "postgres" });
      try {
        await client.connect();
        return { user, password, client };
      } catch (raw) {
        const err = raw as PgError;
        await client.end().catch(() => undefined);
        if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
          throw new Error(`Can't reach PostgreSQL on ${host}:${port}. Is it installed and running?`);
        }
        if (err.code === "28000" || /role .* does not exist/i.test(err.message)) break; // try the next user name
        if (err.code === "28P01" || /password/i.test(err.message)) {
          if (attempt === 3 || !process.stdin.isTTY) throw new Error(`PostgreSQL rejected the password for "${user}". Set PGPASSWORD and try again.`);
          if (attempt > 0) console.log("That password didn't work. Try again.");
          password = await ask(`Password for PostgreSQL user "${user}" (the one you chose when installing PostgreSQL): `, true);
          continue;
        }
        throw err;
      }
    }
  }
  throw new Error("Couldn't sign in to PostgreSQL. Set PGUSER (and PGPASSWORD) to a superuser and try again.");
}

async function main() {
  const { user, password, client } = await connectAdmin();
  reader?.close();
  try {
    const su = await client.query(`select rolsuper or rolcreatedb as ok from pg_roles where rolname = current_user`);
    if (!su.rows[0]?.ok) throw new Error(`PostgreSQL user "${user}" can't create databases. Use the "postgres" superuser (set PGUSER).`);

    for (const db of DATABASES) {
      const exists = await client.query(`select 1 from pg_database where datname = $1`, [db]);
      if (exists.rowCount === 0) {
        await client.query(`create database "${db}"`);
        console.log(`Created database ${db}`);
      }
      await applyMigrations(urlFor(user, password, db));
      const n = await seedExerciseLibrary(urlFor(user, password, db));
      console.log(`${db}: migrations applied, ${n} exercises loaded`);
    }

    // The app signs in as fito_app, which row-level security applies to.
    const stmt = await client.query(`select format('alter role fito_app with login password %L', $1::text) as sql`, [APP_DB_PASSWORD]);
    await client.query(stmt.rows[0].sql as string);
  } finally {
    await client.end();
  }

  const env = [
    `DATABASE_URL=${urlFor("fito_app", APP_DB_PASSWORD, "fito")}`,
    `DATABASE_ADMIN_URL=${urlFor(user, password, "fito")}`,
    "APP_URL=http://localhost:3000",
  ];
  if (!existsSync(".env.local")) {
    writeFileSync(".env.local", `# Local development only. Created by npm run db:setup-local.\n${env.join("\n")}\n`);
    console.log("Wrote .env.local");
  } else {
    console.log("Kept your existing .env.local. It should contain:");
    for (const line of env) console.log(`  ${line.replace(/:[^:@/]+@/, ":****@")}`);
  }
  if (password) {
    console.log(`For the automated tests, also set TEST_DATABASE_ADMIN_URL=${urlFor(user, "****", "fito_test")} (with your password).`);
  }
  console.log("\nDone. Next: npm run db:seed-demo, then npm run build and npm start, and open http://localhost:3000");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
