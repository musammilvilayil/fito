import { Client } from "pg";

/**
 * E2E runs register many gyms from one IP, which trips FITO's real rate
 * limits. Clear the counters before a run (local/CI databases only).
 */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_ADMIN_URL ?? "postgres://postgres@localhost:5432/fito";
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query("delete from rate_limits");
  } catch (err) {
    console.warn(`Could not reset rate limits (${(err as Error).message}); tests may hit 429s.`);
  } finally {
    await client.end().catch(() => undefined);
  }
}
