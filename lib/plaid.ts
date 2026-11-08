// Plaid (sandbox) bank connections: Link token, public-token exchange, and an
// import of accounts and transactions into the workspace. Server-only.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { accounts, plaidItems, transactions } from "./db/schema";
import { GuardError } from "./guard";
import { openSecret, sealSecret } from "./crypto";

const ENV = (process.env.PLAID_ENV || "sandbox").trim();
const BASE = ENV === "production" ? "https://production.plaid.com" : "https://sandbox.plaid.com";

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());
}

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!plaidConfigured()) throw new GuardError("Bank connections aren't configured on this server.");
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID!.trim(),
      secret: process.env.PLAID_SECRET!.trim(),
      ...body,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error_code?: string; error_message?: string };
  if (!res.ok) {
    throw new PlaidError(json.error_code ?? `HTTP_${res.status}`, json.error_message ?? "Plaid request failed");
  }
  return json;
}

export class PlaidError extends GuardError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(`Plaid: ${message}`);
  }
}

export async function createLinkToken(workspaceId: string): Promise<string> {
  const res = await plaid<{ link_token: string }>("/link/token/create", {
    client_name: "VeraFund",
    user: { client_user_id: workspaceId },
    products: ["transactions"],
    transactions: { days_requested: 90 },
    country_codes: ["US"],
    language: "en",
  });
  return res.link_token;
}

// Sandbox shortcut: create a public token for a test bank without opening Link.
export async function sandboxPublicToken(): Promise<string> {
  const res = await plaid<{ public_token: string }>("/sandbox/public_token/create", {
    institution_id: "ins_109508", // First Platypus Bank
    initial_products: ["transactions"],
  });
  return res.public_token;
}

// Plaid's personal-finance categories mapped onto ours.
const CATEGORY_MAP: Record<string, string> = {
  INCOME: "income",
  TRANSFER_IN: "transfer",
  TRANSFER_OUT: "transfer",
  LOAN_PAYMENTS: "transfer",
  BANK_FEES: "utilities",
  ENTERTAINMENT: "entertainment",
  FOOD_AND_DRINK: "food",
  GENERAL_MERCHANDISE: "shopping",
  HOME_IMPROVEMENT: "shopping",
  MEDICAL: "shopping",
  PERSONAL_CARE: "shopping",
  GENERAL_SERVICES: "subscriptions",
  GOVERNMENT_AND_NON_PROFIT: "utilities",
  TRANSPORTATION: "transport",
  TRAVEL: "transport",
  RENT_AND_UTILITIES: "utilities",
};

const ACCOUNT_COLORS = ["#0A85EA", "#6E44FF", "#00A651", "#FF6600", "#D71E28"];

interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;
  balances: { current: number | null; available: number | null };
}

interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number; // positive = money out
  date: string;
  datetime: string | null;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  personal_finance_category?: { primary?: string } | null;
}

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export async function connectBank(workspaceId: string, publicToken: string, institutionName: string) {
  const db = await getDb();
  const exchange = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
    public_token: publicToken,
  });

  const [existing] = await db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.workspaceId, workspaceId), eq(plaidItems.itemId, exchange.item_id)));
  if (existing) throw new GuardError(`${institutionName} is already connected.`);

  const itemRowId = randomUUID();
  await db.insert(plaidItems).values({
    id: itemRowId,
    workspaceId,
    itemId: exchange.item_id,
    accessToken: sealSecret(exchange.access_token), // encrypted at rest
    institutionName: institutionName.slice(0, 60) || "Bank",
    cursor: null,
    importedCount: 0,
    createdAt: Date.now(),
    lastSyncedAt: null,
  });
  return syncBank(workspaceId, itemRowId);
}

// Pulls new transactions with /transactions/sync. Sandbox data can take a few
// seconds to become ready after linking, so this retries briefly.
export async function syncBank(workspaceId: string, itemRowId: string) {
  const db = await getDb();
  const [item] = await db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.id, itemRowId), eq(plaidItems.workspaceId, workspaceId)));
  if (!item) throw new GuardError("That bank connection doesn't exist in your workspace.");

  const acc = await plaid<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: openSecret(item.accessToken) });
  const accountIdMap = new Map<string, string>();
  const existingAccounts = await db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId));
  for (const [i, a] of acc.accounts.entries()) {
    const ourId = `plaid_${a.account_id}`;
    accountIdMap.set(a.account_id, ourId);
    // Loans and credit lines are liabilities; investments and savings-like accounts are assets.
    const type =
      a.type === "credit" || a.type === "loan"
        ? "credit"
        : a.type === "investment" || ["savings", "cd", "money market", "hsa"].includes(a.subtype ?? "")
          ? "savings"
          : "checking";
    const balance = toCents(a.balances.current ?? a.balances.available ?? 0);
    const row = {
      name: `${a.name}${a.mask ? ` ••${a.mask}` : ""}`,
      type: type as "checking" | "savings" | "credit",
      institution: item.institutionName,
      balanceCents: type === "credit" ? -balance : balance,
      color: ACCOUNT_COLORS[i % ACCOUNT_COLORS.length],
    };
    if (existingAccounts.some((e) => e.id === ourId)) {
      await db.update(accounts).set(row).where(and(eq(accounts.id, ourId), eq(accounts.workspaceId, workspaceId)));
    } else {
      await db.insert(accounts).values({ id: ourId, workspaceId, ...row });
    }
  }

  let cursor = item.cursor ?? undefined;
  const added: PlaidTransaction[] = [];
  for (let attempt = 0, more = true; more && attempt < 12; attempt++) {
    const page = await plaid<{ added: PlaidTransaction[]; next_cursor: string; has_more: boolean }>(
      "/transactions/sync",
      { access_token: openSecret(item.accessToken), cursor, count: 250 },
    );
    added.push(...page.added);
    cursor = page.next_cursor;
    more = page.has_more;
    // A brand-new sandbox item may report nothing yet; wait and try again.
    if (!more && added.length === 0 && !item.cursor && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1500));
      more = true;
    }
  }

  const now = Date.now();
  const rows = added.map((t) => ({
    id: `plaid_${t.transaction_id}`,
    workspaceId,
    accountId: accountIdMap.get(t.account_id) ?? "plaid",
    merchant: (t.merchant_name || t.name).slice(0, 80),
    category: CATEGORY_MAP[t.personal_finance_category?.primary ?? ""] ?? (t.amount < 0 ? "income" : "shopping"),
    amountCents: -toCents(t.amount),
    occurredAt: new Date(t.datetime ?? `${t.date}T12:00:00`).getTime(),
    description: `Imported from ${item.institutionName}`,
    status: (t.pending ? "pending" : "posted") as "pending" | "posted",
    riskScore: null,
    riskSignals: null,
    subscriptionId: null,
    createdAt: now,
  }));
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(transactions).values(rows.slice(i, i + 100)).onConflictDoNothing();
  }

  await db
    .update(plaidItems)
    .set({ cursor: cursor ?? null, importedCount: item.importedCount + rows.length, lastSyncedAt: now })
    .where(eq(plaidItems.id, item.id));
  return { accounts: acc.accounts.length, transactions: rows.length };
}

export async function listBanks(workspaceId: string) {
  const db = await getDb();
  return db.select({
    id: plaidItems.id,
    institutionName: plaidItems.institutionName,
    importedCount: plaidItems.importedCount,
    createdAt: plaidItems.createdAt,
    lastSyncedAt: plaidItems.lastSyncedAt,
  }).from(plaidItems).where(eq(plaidItems.workspaceId, workspaceId));
}
