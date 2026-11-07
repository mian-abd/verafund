// A realistic AgentContext for unit tests (mirrors the seeded workspace). Not used at runtime.

import type { AgentContext, CtxSub } from "./types";

export function testSub(merchant: string, extra: Partial<CtxSub> = {}): CtxSub {
  return {
    id: `sub-${merchant.toLowerCase().replace(/\W+/g, "-")}`,
    merchant,
    category: "Streaming",
    amountCents: 1599,
    cycle: "monthly",
    kind: "paid",
    status: "active",
    cardStatus: "active",
    cardLast4: "4242",
    limitCents: 1599,
    pendingCharge: null,
    ...extra,
  };
}

export function testCtx(extra: Partial<AgentContext> = {}): AgentContext {
  return {
    userName: "Alex Chen",
    subs: [
      testSub("Netflix"),
      testSub("Spotify", { amountCents: 1199, limitCents: 1199 }),
      testSub("Planet Fitness", { amountCents: 2499, limitCents: 2499 }),
      testSub("Adobe Creative Cloud", { amountCents: 2299, limitCents: 2299, kind: "trial", status: "trial" }),
    ],
    budgets: [
      { id: "b1", category: "food", limitCents: 46000 },
      { id: "b2", category: "entertainment", limitCents: 7000 },
    ],
    categories: ["housing", "food", "transport", "entertainment", "shopping", "utilities", "subscriptions"],
    goals: [
      { id: "g1", name: "Emergency Fund", targetCents: 300000, savedCents: 150000 },
      { id: "g2", name: "Spring Break Trip", targetCents: 80000, savedCents: 34000 },
      { id: "g3", name: "New Laptop Fund", targetCents: 120000, savedCents: 45000 },
    ],
    debts: [
      { id: "d1", name: "Discover it Student", kind: "credit_card", balanceCents: 68000 },
      { id: "d2", name: "Federal Student Loan", kind: "student_loan", balanceCents: 1240000 },
    ],
    flagged: null,
    memories: [],
    ...extra,
  };
}
