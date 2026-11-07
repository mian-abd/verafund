// The "Try saying" list in Vera's dock: example commands built from the user's own merchants,
// goals, debts and categories, so every suggestion is something that works for them right now.
// Each one is a phrase the preset matcher understands. Pure.

import { formatCents } from "../format";
import type { AgentContext } from "./types";

type HintCtx = Pick<AgentContext, "subs" | "goals" | "debts" | "budgets" | "flagged" | "memories">;

export function buildHints(ctx: HintCtx, max = 6): string[] {
  const hints: string[] = [];
  const live = ctx.subs.filter((s) => s.status !== "cancelled");

  if (ctx.flagged) hints.push("No, that wasn't me");
  const priceHike = live.find((s) => s.pendingCharge);
  if (priceHike) hints.push(`Approve the new ${priceHike.merchant} price`);
  if (live[0]) hints.push(`Cancel ${live[0].merchant}`);
  const second = live.find((s) => s.merchant !== live[0]?.merchant && s.cardStatus === "active");
  if (second) hints.push(`Pause ${second.merchant}`);

  const budget = ctx.budgets.find((b) => b.category === "food") ?? ctx.budgets[0];
  if (budget) {
    const dollars = Math.max(50, Math.round((budget.limitCents / 100) * 0.65 / 50) * 50);
    hints.push(`Set my ${budget.category} budget to ${formatCents(dollars * 100).replace(/\.00$/, "")}`);
  }
  const goal = ctx.goals.find((g) => g.savedCents + 5000 <= g.targetCents);
  if (goal) hints.push(`Put $50 in my ${goal.name}`);
  const debt = ctx.debts.find((d) => d.balanceCents >= 10000);
  if (debt) hints.push(`Pay $100 toward my ${debt.name}`);
  hints.push("Find my subscriptions");
  if (ctx.memories.length > 0) hints.push("What do you remember?");

  return hints.slice(0, max);
}
