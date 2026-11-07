// Loads the workspace snapshot the agent validates every proposed action against. Reads only,
// always scoped by workspaceId.

import { getFinance } from "../finance";
import { getDashboard } from "../guard";
import { listMemoryFacts } from "./memory";
import type { AgentContext } from "./types";

export async function loadAgentContext(workspaceId: string): Promise<AgentContext> {
  const [finance, dash, memories] = await Promise.all([getFinance(workspaceId), getDashboard(workspaceId), listMemoryFacts(workspaceId)]);

  const categories = new Set<string>(finance.budgets.map((b) => b.category));
  for (const t of finance.transactions) {
    if (t.amountCents < 0 && t.category !== "transfer" && t.category !== "income" && t.category !== "subscriptions") categories.add(t.category);
  }
  if (finance.budgets.some((b) => b.category === "subscriptions")) categories.add("subscriptions");

  // Transactions arrive newest first, so the first flagged one is the newest.
  const flagged = finance.transactions.find((t) => t.status === "flagged") ?? null;

  return {
    userName: finance.profile?.displayName ?? "",
    subs: dash.subscriptions.map((s) => ({
      id: s.id,
      merchant: s.merchant,
      category: s.category,
      amountCents: s.amountCents,
      cycle: s.cycle,
      kind: s.kind,
      status: s.status,
      cardStatus: s.cardStatus,
      cardLast4: s.cardLast4,
      limitCents: s.limitCents,
      pendingCharge: s.pendingPriceChange ? { id: s.pendingPriceChange.id, amountCents: s.pendingPriceChange.amountCents } : null,
    })),
    budgets: finance.budgets.map((b) => ({ id: b.id, category: b.category, limitCents: b.limitCents })),
    categories: [...categories],
    goals: finance.goals.map((g) => ({ id: g.id, name: g.name, targetCents: g.targetCents, savedCents: g.savedCents })),
    debts: finance.debts.map((d) => ({ id: d.id, name: d.name, kind: d.kind, balanceCents: d.balanceCents })),
    flagged: flagged
      ? { id: flagged.id, merchant: flagged.merchant, amountCents: Math.abs(flagged.amountCents), riskScore: flagged.riskScore }
      : null,
    memories,
  };
}
