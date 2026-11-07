// Workspace-scoped service functions behind the agent's non-card actions (budget, goals,
// debt, fraud alerts). The server actions on the goals and transactions pages redirect, so
// they can't be called from here; these mirror their logic. Every statement is scoped by
// workspaceId, and the limits live in the WHERE clause so two quick confirms can't overshoot.

import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { budgets, debts, goals, notifications, transactions } from "../db/schema";
import { parseRiskSignals, severityOf, type RiskSignal } from "../fraud";
import { formatCents } from "../format";
import { GuardError } from "../guard";

// ---------- budget ----------

export async function setBudgetLimit(workspaceId: string, category: string, limitCents: number): Promise<{ created: boolean }> {
  if (!Number.isSafeInteger(limitCents) || limitCents < 100) throw new GuardError("A budget has to be at least $1 a month.");
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.workspaceId, workspaceId), eq(budgets.category, category)));
  if (existing) {
    await db
      .update(budgets)
      .set({ limitCents })
      .where(and(eq(budgets.id, existing.id), eq(budgets.workspaceId, workspaceId)));
    return { created: false };
  }
  await db.insert(budgets).values({ id: randomUUID(), workspaceId, category, limitCents });
  return { created: true };
}

// ---------- goals ----------

export async function addToGoal(workspaceId: string, goalId: string, cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new GuardError("Tell me how many dollars to add.");
  const db = await getDb();
  // The target check is in the WHERE clause, so a goal can never go past its target.
  const res = await db
    .update(goals)
    .set({ savedCents: sql`${goals.savedCents} + ${cents}` })
    .where(and(eq(goals.id, goalId), eq(goals.workspaceId, workspaceId), sql`${goals.savedCents} + ${cents} <= ${goals.targetCents}`));
  const [goal] = await db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.workspaceId, workspaceId)));
  if (res.rowsAffected === 0) {
    if (!goal) throw new GuardError("That goal no longer exists.");
    const remaining = Math.max(0, goal.targetCents - goal.savedCents);
    if (remaining === 0) throw new GuardError(`${goal.name} is already fully funded.`);
    throw new GuardError(`That's more than ${goal.name} needs. You can add up to ${formatCents(remaining)}.`);
  }
  return { name: goal.name, savedCents: goal.savedCents, targetCents: goal.targetCents, reached: goal.savedCents >= goal.targetCents };
}

// ---------- debts ----------

export async function payDebt(workspaceId: string, debtId: string, cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new GuardError("Tell me how many dollars the payment was.");
  const db = await getDb();
  // A payment can never take the balance below zero.
  const res = await db
    .update(debts)
    .set({ balanceCents: sql`${debts.balanceCents} - ${cents}` })
    .where(and(eq(debts.id, debtId), eq(debts.workspaceId, workspaceId), sql`${debts.balanceCents} >= ${cents}`));
  const [debt] = await db.select().from(debts).where(and(eq(debts.id, debtId), eq(debts.workspaceId, workspaceId)));
  if (res.rowsAffected === 0) {
    if (!debt) throw new GuardError("That debt no longer exists.");
    if (debt.balanceCents === 0) throw new GuardError(`${debt.name} is already paid off.`);
    throw new GuardError(`That's more than you owe. The balance on ${debt.name} is ${formatCents(debt.balanceCents)}.`);
  }
  return { name: debt.name, balanceCents: debt.balanceCents, paidOff: debt.balanceCents === 0 };
}

// ---------- fraud alerts ----------

// The newest transaction Vera flagged and the user hasn't answered yet.
export async function newestFlagged(workspaceId: string) {
  const db = await getDb();
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.status, "flagged")))
    .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
    .limit(1);
  return tx ?? null;
}

// Mirrors resolveFlaggedAction in app/app/transactions/actions.ts: "yes" posts the charge and
// lowers its risk score; "no" blocks it and leaves a notification. The status check in the
// WHERE clause means a flag can only be answered once.
export async function answerFlaggedCharge(workspaceId: string, transactionId: string, wasMe: boolean) {
  const db = await getDb();
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, transactionId), eq(transactions.workspaceId, workspaceId)));
  if (!tx) throw new GuardError("That transaction doesn't exist in your workspace.");
  if (tx.status !== "flagged") throw new GuardError("You already answered this charge.");
  const amountCents = Math.abs(tx.amountCents);

  if (wasMe) {
    const before = tx.riskScore ?? 0;
    const after = Math.round(before * 0.3);
    const signals: RiskSignal[] = [
      ...parseRiskSignals(tx.riskSignals),
      {
        signal: "user_confirmed",
        points: after - before,
        detail: `You told Vera this purchase was yours, so the risk dropped from ${before} to ${after}.`,
      },
    ];
    const done = await db
      .update(transactions)
      .set({ status: "posted", riskScore: after, riskSignals: JSON.stringify(signals) })
      .where(and(eq(transactions.id, transactionId), eq(transactions.workspaceId, workspaceId), eq(transactions.status, "flagged")))
      .returning({ id: transactions.id });
    if (done.length === 0) throw new GuardError("You already answered this charge.");
    return { merchant: tx.merchant, amountCents, blocked: false };
  }

  const done = await db
    .update(transactions)
    .set({ status: "blocked" })
    .where(and(eq(transactions.id, transactionId), eq(transactions.workspaceId, workspaceId), eq(transactions.status, "flagged")))
    .returning({ id: transactions.id });
  if (done.length === 0) throw new GuardError("You already answered this charge.");
  await db.insert(notifications).values({
    id: randomUUID(),
    workspaceId,
    kind: "fraud_blocked",
    title: `Vera blocked a ${formatCents(amountCents)} charge at ${tx.merchant}`,
    body: `You said it wasn't you, so the ${severityOf(tx.riskScore ?? 0)}-risk charge was blocked and no money moved.`,
    read: false,
    createdAt: Date.now(),
  });
  return { merchant: tx.merchant, amountCents, blocked: true };
}
