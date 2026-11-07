"use server";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GOAL_ICON_NAMES } from "@/components/goals/icons";
import { getDb } from "@/lib/db/client";
import { budgets, debts, goals } from "@/lib/db/schema";
import { formatCents } from "@/lib/format";
import { getWorkspace, workspaceNow } from "@/lib/guard";
import { getWorkspaceId } from "@/lib/session";

const GOALS_PATH = "/app/goals";
const MAX_MONEY_CENTS = 1_000_000_000; // $10M: far above anything a personal budget needs

class InputError extends Error {}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function requireId(formData: FormData, name: string): string {
  const value = text(formData, name);
  if (!value || value.length > 64) throw new InputError("That item could not be found.");
  return value;
}

// Positive dollars like "1,250.50" to cents. Goals and debts exceed the $10,000 charge cap in lib/format.
function dollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_MONEY_CENTS) return null;
  return cents;
}

function moneyField(formData: FormData, name: string, label: string): number {
  const cents = dollarsToCents(text(formData, name));
  if (cents === null) throw new InputError(`Enter ${label} like 250 or 250.50 (more than $0, up to $10,000,000).`);
  return cents;
}

// Runs a workspace-scoped mutation, then sends the user back to /app/goals with a
// persistent notice or error. Never updates a row by id alone.
async function run(mutate: (workspaceId: string) => Promise<string>): Promise<never> {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) redirect("/?expired=1");

  let notice: string | null = null;
  let error: string | null = null;
  try {
    notice = await mutate(workspaceId);
  } catch (err) {
    if (err instanceof InputError) {
      error = err.message;
    } else {
      console.error("[goals action]", err);
      error = "Something went wrong. Try again.";
    }
  }
  revalidatePath("/app", "layout");
  redirect(error ? `${GOALS_PATH}?error=${encodeURIComponent(error)}` : `${GOALS_PATH}?notice=${encodeURIComponent(notice ?? "Saved.")}`);
}

export async function addGoalAction(formData: FormData) {
  await run(async (workspaceId) => {
    const name = text(formData, "name");
    if (!name) throw new InputError("Give your goal a name.");
    if (name.length > 40) throw new InputError("Keep the goal name under 40 characters.");
    const targetCents = moneyField(formData, "target", "a target amount");
    const icon = text(formData, "icon");
    if (!GOAL_ICON_NAMES.includes(icon)) throw new InputError("Pick an icon for your goal.");

    const ws = await getWorkspace(workspaceId);
    if (!ws) throw new InputError("Your session expired. Get started again from the home page.");
    const now = workspaceNow(ws);

    let dueAt: number | null = null;
    const due = text(formData, "dueDate");
    if (due) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
      if (!m) throw new InputError("Enter the due date as a valid date.");
      const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
      const check = new Date(ms);
      if (check.getUTCMonth() !== Number(m[2]) - 1 || check.getUTCFullYear() < 2000 || check.getUTCFullYear() > 2100) {
        throw new InputError("Enter the due date as a valid date.");
      }
      if (ms <= now) throw new InputError("Pick a due date in the future.");
      dueAt = ms;
    }

    const db = await getDb();
    await db.insert(goals).values({
      id: randomUUID(),
      workspaceId,
      name,
      icon,
      targetCents,
      savedCents: 0,
      dueAt,
      createdAt: now,
    });
    return `Added goal “${name}”.`;
  });
}

export async function addToGoalAction(formData: FormData) {
  await run(async (workspaceId) => {
    const id = requireId(formData, "goalId");
    const cents = moneyField(formData, "amount", "an amount");
    const db = await getDb();
    // Atomic: the target check lives in the WHERE clause so two quick submits can't overshoot.
    const res = await db
      .update(goals)
      .set({ savedCents: sql`${goals.savedCents} + ${cents}` })
      .where(
        and(
          eq(goals.id, id),
          eq(goals.workspaceId, workspaceId),
          sql`${goals.savedCents} + ${cents} <= ${goals.targetCents}`,
        ),
      );
    if (res.rowsAffected === 0) {
      const [goal] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.workspaceId, workspaceId)));
      if (!goal) throw new InputError("That goal no longer exists.");
      const remaining = Math.max(0, goal.targetCents - goal.savedCents);
      if (remaining === 0) throw new InputError(`“${goal.name}” is already fully funded.`);
      throw new InputError(`That is more than the goal needs. You can add up to ${formatCents(remaining)} to “${goal.name}”.`);
    }
    const [goal] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.workspaceId, workspaceId)));
    return goal && goal.savedCents >= goal.targetCents
      ? `Goal reached! “${goal.name}” is fully funded.`
      : `Added ${formatCents(cents)} to ${goal?.name ?? "your goal"}.`;
  });
}

export async function deleteGoalAction(formData: FormData) {
  await run(async (workspaceId) => {
    const id = requireId(formData, "goalId");
    const db = await getDb();
    const res = await db.delete(goals).where(and(eq(goals.id, id), eq(goals.workspaceId, workspaceId)));
    if (res.rowsAffected === 0) throw new InputError("That goal no longer exists.");
    return "Goal deleted.";
  });
}

export async function recordPaymentAction(formData: FormData) {
  await run(async (workspaceId) => {
    const id = requireId(formData, "debtId");
    const cents = moneyField(formData, "amount", "a payment amount");
    const db = await getDb();
    const res = await db
      .update(debts)
      .set({ balanceCents: sql`${debts.balanceCents} - ${cents}` })
      .where(and(eq(debts.id, id), eq(debts.workspaceId, workspaceId), sql`${debts.balanceCents} >= ${cents}`));
    const [debt] = await db.select().from(debts).where(and(eq(debts.id, id), eq(debts.workspaceId, workspaceId)));
    if (res.rowsAffected === 0) {
      if (!debt) throw new InputError("That debt no longer exists.");
      if (debt.balanceCents === 0) throw new InputError(`“${debt.name}” is already paid off.`);
      throw new InputError(`That is more than you owe. The balance on “${debt.name}” is ${formatCents(debt.balanceCents)}.`);
    }
    return debt && debt.balanceCents === 0
      ? `Paid off! “${debt.name}” is at $0.00.`
      : `Recorded a ${formatCents(cents)} payment on ${debt?.name ?? "your debt"}.`;
  });
}

export async function updateBudgetLimitAction(formData: FormData) {
  await run(async (workspaceId) => {
    const id = requireId(formData, "budgetId");
    const cents = moneyField(formData, "limit", "a monthly limit");
    const db = await getDb();
    const res = await db
      .update(budgets)
      .set({ limitCents: cents })
      .where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId)));
    if (res.rowsAffected === 0) throw new InputError("That budget no longer exists.");
    const [budget] = await db.select().from(budgets).where(and(eq(budgets.id, id), eq(budgets.workspaceId, workspaceId)));
    return `Budget limit for ${budget?.category ?? "category"} set to ${formatCents(cents)}.`;
  });
}
