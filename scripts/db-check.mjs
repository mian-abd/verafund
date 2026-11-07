// Connects to the configured database (DATABASE_URL / TURSO_DATABASE_URL, or the local file),
// creates the schema if needed and prints table row counts. Prints no credentials.
import { createClient } from "@libsql/client";
const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:verafund.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
const db = createClient({ url, authToken });
const started = Date.now();
await db.execute("select 1");
console.log(`connected to ${url.startsWith("file:") ? url : new URL(url).host} in ${Date.now() - started}ms`);
for (const table of ["workspaces", "subscriptions", "charges", "policy_events"]) {
  const r = await db.execute(`select count(*) as n from ${table}`).catch(() => null);
  console.log(`${table}: ${r ? r.rows[0].n : "missing (created on first app request)"}`);
}
