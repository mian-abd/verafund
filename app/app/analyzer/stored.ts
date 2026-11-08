// What a purchase check saves in `purchase_checks.analysis` (JSON text), and how it is read back.

import { cleanStoreName } from "@/lib/ai";
import { spendByCategory, startOfMonth, type Finance } from "@/lib/finance";
import { parseSavedCompare, type SavedCompare } from "@/lib/price-compare";
import { discretionaryRemaining, monthlySavingsPace, type PurchaseAnalysis, type PurchaseInput } from "@/lib/purchase";

export type PurchaseSource = "typed" | "photo";

export interface StoredAnalysis extends PurchaseAnalysis {
  source: PurchaseSource;
  /** True when the name or price was read from the photo by Claude. */
  aiExtracted: boolean;
  /** Claude's plain-English explanation; null when AI was offline. */
  explanation: string | null;
  /** Store the user was going to buy from, read from their photo (e.g. "Best Buy"). */
  store?: string | null;
  /** Cheaper offers found by the web search; saved by /api/analyzer/compare. Absent until it ran. */
  compare?: SavedCompare | null;
}

export function buildPurchaseInput(finance: Finance, priceCents: number): PurchaseInput {
  const income = finance.profile?.monthlyIncomeCents ?? 0;
  const spent = spendByCategory(finance.transactions, startOfMonth(finance.now));
  return {
    priceCents,
    monthlyIncomeCents: income,
    hourlyRateCents: finance.profile?.hourlyRateCents ?? 0,
    taxRateBps: finance.profile?.taxRateBps ?? 0,
    discretionaryRemainingCents: discretionaryRemaining(finance.budgets, spent),
    liquidCents: finance.accounts.filter((a) => a.type !== "credit").reduce((s, a) => s + a.balanceCents, 0),
    monthlySavingsCents: monthlySavingsPace(finance.transactions, income, finance.now),
    goals: finance.goals,
    debts: finance.debts,
  };
}

export function parseStored(json: string): StoredAnalysis | null {
  try {
    const raw = JSON.parse(json) as Partial<StoredAnalysis>;
    if (!raw || typeof raw !== "object" || typeof raw.priceCents !== "number" || !Array.isArray(raw.reasons)) return null;
    return {
      priceCents: raw.priceCents,
      afterTaxHourlyCents: raw.afterTaxHourlyCents ?? 0,
      hoursOfWork: raw.hoursOfWork ?? null,
      percentOfIncome: raw.percentOfIncome ?? null,
      remainingBeforeCents: raw.remainingBeforeCents ?? 0,
      remainingAfterCents: raw.remainingAfterCents ?? 0,
      goalImpacts: Array.isArray(raw.goalImpacts) ? raw.goalImpacts : [],
      verdict: raw.verdict ?? "caution",
      reasons: raw.reasons.filter((r): r is string => typeof r === "string"),
      source: raw.source === "photo" ? "photo" : "typed",
      aiExtracted: Boolean(raw.aiExtracted),
      explanation: typeof raw.explanation === "string" ? raw.explanation : null,
      store: cleanStoreName(raw.store),
      compare: parseSavedCompare(raw.compare),
    };
  } catch {
    return null;
  }
}
