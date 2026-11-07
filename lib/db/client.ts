import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Same code path for Turso in the cloud (libsql://...) and a local SQLite file
// (file:...), which is what the Jetson build will use.

const DDL = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    clock_offset_days INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    cycle TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    trial_ends_at INTEGER,
    limit_cents INTEGER NOT NULL,
    card_provider TEXT NOT NULL,
    card_id TEXT NOT NULL,
    card_last4 TEXT NOT NULL,
    card_status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    position INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS subscriptions_workspace ON subscriptions(workspace_id)`,
  `CREATE TABLE IF NOT EXISTS charges (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    merchant TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    attempted_at INTEGER NOT NULL,
    approved INTEGER NOT NULL,
    reason TEXT,
    reason_text TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_authorization_id TEXT,
    provider_reason TEXT,
    resolution TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS charges_workspace ON charges(workspace_id, subscription_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS policy_events (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL,
    type TEXT NOT NULL,
    detail TEXT NOT NULL,
    actor TEXT NOT NULL,
    at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS policy_events_workspace ON policy_events(workspace_id, subscription_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    workspace_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    monthly_income_cents INTEGER NOT NULL,
    hourly_rate_cents INTEGER NOT NULL,
    tax_rate_bps INTEGER NOT NULL,
    employer TEXT NOT NULL,
    pay_frequency TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    institution TEXT NOT NULL,
    balance_cents INTEGER NOT NULL,
    color TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS accounts_workspace ON accounts(workspace_id)`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    occurred_at INTEGER NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    risk_score INTEGER,
    risk_signals TEXT,
    subscription_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS transactions_workspace ON transactions(workspace_id, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    category TEXT NOT NULL,
    limit_cents INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    target_cents INTEGER NOT NULL,
    saved_cents INTEGER NOT NULL,
    due_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    balance_cents INTEGER NOT NULL,
    original_cents INTEGER NOT NULL,
    apr_bps INTEGER NOT NULL,
    min_payment_cents INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_cards (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    type TEXT NOT NULL,
    last4 TEXT NOT NULL,
    base_reward_bps INTEGER NOT NULL,
    category_bonuses TEXT NOT NULL,
    annual_fee_cents INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notifications_workspace ON notifications(workspace_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS advisor_messages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS plaid_items (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    cursor TEXT,
    imported_count INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_synced_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS purchase_checks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    item TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    verdict TEXT NOT NULL,
    analysis TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
];

export type Db = LibSQLDatabase<typeof schema>;

// DATABASE_URL wins. Otherwise use whatever libsql:// URL the Vercel Marketplace Turso
// integration injected (TURSO_DATABASE_URL, or <PREFIX>_... with a custom prefix), and the
// auth token that shares its prefix.
function libsqlFromEnv(): { url: string; token: string | undefined } {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) return { url: explicit, token: process.env.DATABASE_AUTH_TOKEN || undefined };
  const preferred = process.env.TURSO_DATABASE_URL ? "TURSO_DATABASE_URL" : undefined;
  const key =
    preferred ??
    Object.keys(process.env)
      .sort()
      .find((k) => process.env[k]?.trim().startsWith("libsql://"));
  if (!key) return { url: "", token: undefined };
  const prefix = key.replace(/(_DATABASE)?_URL$/, "");
  const token =
    process.env[`${prefix}_AUTH_TOKEN`] ||
    process.env[`${prefix}_DATABASE_AUTH_TOKEN`] ||
    process.env.DATABASE_AUTH_TOKEN ||
    process.env.TURSO_AUTH_TOKEN ||
    undefined;
  return { url: process.env[key]!.trim(), token };
}

function configuredUrl(): string {
  return libsqlFromEnv().url;
}

export function databaseKind(): "turso" | "file" {
  const url = configuredUrl();
  return !url || url.startsWith("file:") ? "file" : "turso";
}

function resolveUrl(): string {
  const url = configuredUrl();
  if (url) return url;
  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL is not set. Create a Turso database and set DATABASE_URL and DATABASE_AUTH_TOKEN in Vercel.",
    );
  }
  return "file:verafund.db";
}

let state: { client: Client; db: Db; ready: Promise<void> } | null = null;

export async function getDb(): Promise<Db> {
  if (!state) {
    const client = createClient({
      url: resolveUrl(),
      authToken: libsqlFromEnv().token,
    });
    const ready = client
      .batch(DDL, "write")
      .then(() => undefined)
      .catch((err) => {
        state = null;
        throw err;
      });
    state = { client, db: drizzle(client, { schema }), ready };
  }
  await state.ready;
  return state.db;
}
