// Vera's brain: builds a compact snapshot of the user's real data, asks Claude with it as
// context, and falls back to deterministic rule-based answers computed from the same snapshot.

import { askClaude, aiEnabled, type ChatTurn } from "@/lib/ai";
import { formatCents, formatDate } from "@/lib/format";
import { spendByCategory, startOfMonth, type Finance } from "@/lib/finance";
import type { getDashboard } from "@/lib/guard";
import {
  ESSENTIAL_CATEGORIES,
  analyzePurchase,
  discretionaryRemaining,
  monthlySavingsPace,
  payoffPlan,
  VERDICT_LABEL,
} from "@/lib/purchase";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

export const OFFLINE_LABEL = "Rule-based answer (AI offline)";

export interface SubSummary {
  merchant: string;
  monthlyCents: number;
  amountCents: number;
  cycle: "monthly" | "yearly";
  limitCents: number;
  status: string;
  lastChargeCents: number | null;
  lastChargeApproved: boolean | null;
}

export interface Snapshot {
  name: string;
  now: number;
  incomeCents: number;
  hourlyRateCents: number;
  taxRateBps: number;
  accounts: Array<{ name: string; type: string; balanceCents: number }>;
  liquidCents: number;
  spent: Record<string, number>;
  topMerchants: Record<string, Array<{ merchant: string; cents: number }>>;
  budgets: Array<{ category: string; limitCents: number }>;
  discretionaryLeftCents: number;
  monthlySavingsCents: number;
  goals: Array<{ name: string; targetCents: number; savedCents: number }>;
  debts: Array<{ name: string; kind: string; balanceCents: number; aprBps: number; minPaymentCents: number }>;
  subs: SubSummary[];
}

export function buildSnapshot(finance: Finance, dashboard: Dashboard): Snapshot {
  const since = startOfMonth(finance.now);
  const spent = spendByCategory(finance.transactions, since);
  const merchants: Record<string, Record<string, number>> = {};
  for (const t of finance.transactions) {
    if (t.occurredAt < since || t.amountCents >= 0 || t.category === "transfer" || t.status === "blocked") continue;
    const m = (merchants[t.category] ??= {});
    m[t.merchant] = (m[t.merchant] ?? 0) - t.amountCents;
  }
  const topMerchants: Snapshot["topMerchants"] = {};
  for (const [cat, m] of Object.entries(merchants)) {
    topMerchants[cat] = Object.entries(m)
      .map(([merchant, cents]) => ({ merchant, cents }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 3);
  }
  const income = finance.profile?.monthlyIncomeCents ?? 0;
  return {
    name: finance.profile?.displayName ?? "there",
    now: finance.now,
    incomeCents: income,
    hourlyRateCents: finance.profile?.hourlyRateCents ?? 0,
    taxRateBps: finance.profile?.taxRateBps ?? 0,
    accounts: finance.accounts.map((a) => ({ name: a.name, type: a.type, balanceCents: a.balanceCents })),
    liquidCents: finance.accounts.filter((a) => a.type !== "credit").reduce((s, a) => s + a.balanceCents, 0),
    spent,
    topMerchants,
    budgets: finance.budgets.map((b) => ({ category: b.category, limitCents: b.limitCents })),
    discretionaryLeftCents: discretionaryRemaining(finance.budgets, spent),
    monthlySavingsCents: monthlySavingsPace(finance.transactions, income, finance.now),
    goals: finance.goals.map((g) => ({ name: g.name, targetCents: g.targetCents, savedCents: g.savedCents })),
    debts: finance.debts.map((d) => ({
      name: d.name,
      kind: d.kind,
      balanceCents: d.balanceCents,
      aprBps: d.aprBps,
      minPaymentCents: d.minPaymentCents,
    })),
    subs: dashboard.subscriptions
      .filter((s) => s.status !== "cancelled")
      .map((s) => ({
        merchant: s.merchant,
        monthlyCents: s.cycle === "monthly" ? s.amountCents : Math.round(s.amountCents / 12),
        amountCents: s.amountCents,
        cycle: s.cycle,
        limitCents: s.limitCents,
        status: s.status,
        lastChargeCents: s.lastCharge?.amountCents ?? null,
        lastChargeApproved: s.lastCharge ? s.lastCharge.approved : null,
      })),
  };
}

const usd = formatCents;

export function buildContext(s: Snapshot): string {
  const lines: string[] = [];
  lines.push(`Today: ${formatDate(s.now)}. User: ${s.name}.`);
  lines.push(
    `Income: ${usd(s.incomeCents)}/month; hourly rate ${usd(s.hourlyRateCents)} before ${(s.taxRateBps / 100).toFixed(0)}% tax.`,
  );
  lines.push(`Accounts: ${s.accounts.map((a) => `${a.name} (${a.type}) ${usd(a.balanceCents)}`).join("; ") || "none"}.`);
  const budgetLines = s.budgets.map((b) => {
    const spent = s.spent[b.category] ?? 0;
    return `${b.category} ${usd(spent)} of ${usd(b.limitCents)}${spent > b.limitCents ? " (OVER)" : ""}`;
  });
  const unbudgeted = Object.entries(s.spent)
    .filter(([c]) => !s.budgets.some((b) => b.category === c) && c !== "income")
    .map(([c, v]) => `${c} ${usd(v)} (no budget)`);
  lines.push(`This month's spending vs budget: ${[...budgetLines, ...unbudgeted].join("; ") || "none"}.`);
  lines.push(
    `Discretionary budget left this month (budgets excluding ${ESSENTIAL_CATEGORIES.join(", ")}): ${usd(s.discretionaryLeftCents)}.`,
  );
  lines.push(`Current savings pace: ${usd(s.monthlySavingsCents)}/month toward goals.`);
  lines.push(
    `Goals: ${s.goals.map((g) => `${g.name} ${usd(g.savedCents)} of ${usd(g.targetCents)}`).join("; ") || "none"}.`,
  );
  lines.push(
    `Debts: ${
      s.debts
        .map((d) => `${d.name} (${d.kind.replace("_", " ")}) ${usd(d.balanceCents)} at ${(d.aprBps / 100).toFixed(2)}% APR, min ${usd(d.minPaymentCents)}/mo`)
        .join("; ") || "none"
    }.`,
  );
  lines.push(
    `Recurring subscriptions (guarded by virtual cards): ${
      s.subs
        .map(
          (x) =>
            `${x.merchant} ${usd(x.amountCents)}/${x.cycle === "yearly" ? "yr" : "mo"} (limit ${usd(x.limitCents)}, ${x.status}${
              x.lastChargeCents !== null ? `, last charge ${usd(x.lastChargeCents)} ${x.lastChargeApproved ? "approved" : "blocked"}` : ""
            })`,
        )
        .join("; ") || "none"
    }.`,
  );
  return lines.join("\n");
}

export function buildSystemPrompt(context: string): string {
  return [
    "You are Vera, the friendly personal-finance assistant inside VeraFund.",
    "Answer using only the user's data below. Be concise (under 120 words) and specific with dollar amounts.",
    "Never invent numbers that are not in the data or derivable from it. Plain text only: no markdown headings; short sentences or simple '- ' bullets are fine.",
    "If asked for investment picks or tax/legal advice, say you are not a licensed advisor and keep to budgeting.",
    "",
    "USER DATA",
    context,
  ].join("\n");
}

// ---------- rule-based fallback ----------

function extractAmountCents(q: string): number | null {
  const m = q.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/) ?? q.match(/\b(\d[\d,]*(?:\.\d{1,2})?)\s*(?:dollars|bucks|usd)\b/i) ?? q.match(/\b(\d{2,}(?:,\d{3})*(?:\.\d{1,2})?)\b/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

function affordability(q: string, s: Snapshot): string {
  const price = extractAmountCents(q);
  if (price === null) {
    return s.discretionaryLeftCents > 0
      ? `You have ${usd(s.discretionaryLeftCents)} of discretionary budget left this month (entertainment, shopping and subscriptions). Tell me the price, like "Can I afford $120?", and I will check it.`
      : `Your discretionary budget is ${s.discretionaryLeftCents === 0 ? "used up" : `already ${usd(-s.discretionaryLeftCents)} over`} this month, so anything extra comes out of savings or next month's room. Tell me the price and I will check it.`;
  }
  const a = analyzePurchase({
    priceCents: price,
    monthlyIncomeCents: s.incomeCents,
    hourlyRateCents: s.hourlyRateCents,
    taxRateBps: s.taxRateBps,
    discretionaryRemainingCents: s.discretionaryLeftCents,
    liquidCents: s.liquidCents,
    monthlySavingsCents: s.monthlySavingsCents,
    goals: s.goals,
    debts: s.debts,
  });
  const head =
    a.verdict === "affordable"
      ? `Yes, ${usd(price)} fits this month.`
      : a.verdict === "caution"
        ? `${usd(price)} is doable, but think twice.`
        : `I would not recommend ${usd(price)} right now.`;
  const bullets = a.reasons.slice(0, 4).map((r) => `- ${r}`);
  return [`${head} Verdict: ${VERDICT_LABEL[a.verdict]}.`, ...bullets].join("\n");
}

function overspending(s: Snapshot): string {
  const rows = s.budgets
    .map((b) => ({ ...b, spent: s.spent[b.category] ?? 0 }))
    .map((b) => ({ ...b, pct: b.limitCents > 0 ? b.spent / b.limitCents : 0 }));
  const over = rows.filter((r) => r.spent > r.limitCents).sort((a, b) => b.spent - b.limitCents - (a.spent - a.limitCents));
  const near = rows.filter((r) => r.spent <= r.limitCents && r.pct >= 0.85);
  if (over.length === 0) {
    const top = [...rows].sort((a, b) => b.pct - a.pct)[0];
    return [
      "You are within every budget this month. Nice.",
      top ? `- Closest to its limit: ${top.category} at ${usd(top.spent)} of ${usd(top.limitCents)} (${Math.round(top.pct * 100)}%).` : "",
      ...near.filter((n) => n !== top).map((n) => `- Watch ${n.category}: ${usd(n.spent)} of ${usd(n.limitCents)}.`),
    ]
      .filter(Boolean)
      .join("\n");
  }
  const lines = [`You are over budget in ${over.length} ${over.length === 1 ? "category" : "categories"} this month:`];
  for (const r of over) {
    const merchants = (s.topMerchants[r.category] ?? []).slice(0, 2).map((m) => `${m.merchant} ${usd(m.cents)}`);
    lines.push(
      `- ${r.category}: ${usd(r.spent)} of ${usd(r.limitCents)}, ${usd(r.spent - r.limitCents)} over${merchants.length ? ` (mostly ${merchants.join(", ")})` : ""}.`,
    );
  }
  for (const n of near) lines.push(`- Close: ${n.category} is at ${usd(n.spent)} of ${usd(n.limitCents)}.`);
  const worst = over[0];
  lines.push(`Start by trimming ${worst.category}; even ${usd(Math.min(worst.spent - worst.limitCents, Math.round(worst.spent * 0.2)))} less gets you closer to budget.`);
  return lines.join("\n");
}

function payoff(q: string, s: Snapshot): string {
  const wantsStudent = /student|loan/i.test(q) && !/card|credit/i.test(q);
  const sorted = [...s.debts].filter((d) => d.balanceCents > 0);
  const debt = wantsStudent
    ? sorted.find((d) => d.kind === "student_loan") ?? sorted[0]
    : sorted.find((d) => d.kind === "credit_card") ?? [...sorted].sort((a, b) => b.aprBps - a.aprBps)[0];
  if (!debt) return "You have no debts on record, so there is nothing to pay off. Consider putting the extra toward a goal.";
  const scenarios = [0, 5000, 15000].map((extra) => ({
    extra,
    payment: debt.minPaymentCents + extra,
    plan: payoffPlan(debt.balanceCents, debt.aprBps, debt.minPaymentCents + extra),
  }));
  const fmt = (m: number) => (m >= 24 ? `${(m / 12).toFixed(1)} years` : `${m} month${m === 1 ? "" : "s"}`);
  const lines = [`${debt.name}: ${usd(debt.balanceCents)} at ${(debt.aprBps / 100).toFixed(2)}% APR.`];
  const base = scenarios[0].plan;
  for (const sc of scenarios) {
    if (!sc.plan) {
      lines.push(`- ${usd(sc.payment)}/month never beats the interest, so the balance would not shrink.`);
      continue;
    }
    const saved = base && sc.extra > 0 ? `, saving ${usd(base.totalInterestCents - sc.plan.totalInterestCents)} in interest` : "";
    lines.push(
      `- ${sc.extra === 0 ? "Minimum" : `Minimum +${usd(sc.extra)}`} (${usd(sc.payment)}/mo): paid off in ${fmt(sc.plan.months)}, ${usd(sc.plan.totalInterestCents)} total interest${saved}.`,
    );
  }
  if (s.discretionaryLeftCents > 0) {
    lines.push(`This month you have ${usd(s.discretionaryLeftCents)} of discretionary budget left that could go toward it.`);
  }
  return lines.join("\n");
}

function subscriptionsAnswer(s: Snapshot): string {
  if (s.subs.length === 0) return "You have no active subscriptions in VeraFund right now.";
  const ranked = [...s.subs].sort((a, b) => b.monthlyCents - a.monthlyCents);
  const total = ranked.reduce((sum, x) => sum + x.monthlyCents, 0);
  const lines = [`You pay about ${usd(total)}/month across ${ranked.length} subscriptions. Easiest cuts, biggest savings first:`];
  for (const x of ranked.slice(0, 5)) {
    const note =
      x.status === "trial" ? " (still a trial: cancel before it bills)" : x.status === "trial_ended" ? " (trial ended, already locked)" : "";
    lines.push(`- ${x.merchant}: ${usd(x.monthlyCents)}/mo, ${usd(x.monthlyCents * 12)}/yr${note}`);
  }
  const top2 = ranked.slice(0, 2).reduce((sum, x) => sum + x.monthlyCents * 12, 0);
  lines.push(`Cancelling just the top ${Math.min(2, ranked.length)} saves ${usd(top2)} a year. Pick the ones you have used least this month.`);
  return lines.join("\n");
}

function general(s: Snapshot): string {
  const spentTotal = Object.values(s.spent).reduce((a, b) => a + b, 0);
  const lines = [
    `Here is where you stand this month: ${usd(spentTotal)} spent so far against ${usd(s.incomeCents)} of monthly income.`,
    `- Discretionary budget left: ${usd(s.discretionaryLeftCents)}.`,
    `- Cash in checking and savings: ${usd(s.liquidCents)}.`,
    `- Saving about ${usd(s.monthlySavingsCents)}/month toward ${s.goals.length} goal${s.goals.length === 1 ? "" : "s"}.`,
    "Try asking about affording a purchase, overspending, paying off a card, or which subscriptions to cancel.",
  ];
  return lines.join("\n");
}

export function ruleBasedAnswer(question: string, s: Snapshot): string {
  const q = question.toLowerCase();
  let body: string;
  if (/subscri|cancel|netflix|spotify|gym|recurring/.test(q)) body = subscriptionsAnswer(s);
  else if (/pay\s*(it|this|that|my|the|down)?\s*off|payoff|pay down|debt|credit card|loan|interest|\bapr\b/.test(q)) body = payoff(question, s);
  else if (/overspend|over budget|over-budget|too much|where.*(money|spend|going)|cut back|spending|budget/.test(q) && !/afford|can i buy/.test(q)) body = overspending(s);
  else if (/afford|buy|purchase|trip|spend \$|worth it|\$\s?\d/.test(q)) body = affordability(question, s);
  else body = general(s);
  return `${OFFLINE_LABEL}\n${body}`;
}

export async function answerQuestion(
  question: string,
  history: ChatTurn[],
  snapshot: Snapshot,
): Promise<{ text: string; ai: boolean }> {
  if (aiEnabled()) {
    try {
      const text = await askClaude(buildSystemPrompt(buildContext(snapshot)), [...history, { role: "user", content: question }], 600);
      return { text, ai: true };
    } catch (err) {
      console.error("[advisor] AI call failed, using rule-based answer:", err instanceof Error ? err.message : "unknown error");
    }
  }
  return { text: ruleBasedAnswer(question, snapshot), ai: false };
}
