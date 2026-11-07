// Shared, workspace-scoped reads for the personal-finance pages. Feature modules
// (dashboard, transactions, goals, advisor) build on these instead of querying ad hoc.

import { desc, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import {
  accounts,
  budgets,
  debts,
  goals,
  notifications,
  profiles,
  transactions,
  userCards,
  workspaces,
} from "./db/schema";
import { WorkspaceMissingError, workspaceNow } from "./guard";

export async function getFinance(workspaceId: string) {
  const db = await getDb();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!ws) throw new WorkspaceMissingError();
  const [profile] = await db.select().from(profiles).where(eq(profiles.workspaceId, workspaceId));
  const [accountRows, txRows, budgetRows, goalRows, debtRows, cardRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId)),
    db.select().from(transactions).where(eq(transactions.workspaceId, workspaceId)).orderBy(desc(transactions.occurredAt)),
    db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId)),
    db.select().from(goals).where(eq(goals.workspaceId, workspaceId)),
    db.select().from(debts).where(eq(debts.workspaceId, workspaceId)),
    db.select().from(userCards).where(eq(userCards.workspaceId, workspaceId)),
  ]);
  return {
    workspace: ws,
    now: workspaceNow(ws),
    profile: profile ?? null,
    accounts: accountRows,
    transactions: txRows,
    budgets: budgetRows,
    goals: goalRows,
    debts: debtRows,
    userCards: cardRows,
  };
}

export type Finance = Awaited<ReturnType<typeof getFinance>>;

export async function getNotifications(workspaceId: string, limit = 20) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.workspaceId, workspaceId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

// Spending is negative in storage; this returns positive cents for a month's spend by category.
export function spendByCategory(txs: Finance["transactions"], sinceMs: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txs) {
    if (t.occurredAt < sinceMs || t.amountCents >= 0 || t.category === "transfer" || t.status === "blocked") continue;
    out[t.category] = (out[t.category] ?? 0) - t.amountCents;
  }
  return out;
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
