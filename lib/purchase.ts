// Pure purchase math: what an item really costs in work hours, budget room and goal delay.
// Money is integer cents; nothing here reads the clock or the database.

import { formatCents } from "./format";

export type Verdict = "affordable" | "caution" | "not_recommended";

const WEEKS_PER_MONTH = 52 / 12;
const DAY_MS = 86_400_000;

// Budget categories that are bills or groceries. Everything else with a budget is
// "discretionary": the money you can spend on wants this month.
export const ESSENTIAL_CATEGORIES = ["housing", "utilities", "food", "transport"];

export interface BudgetLike {
  category: string;
  limitCents: number;
}

export interface GoalLike {
  id?: string;
  name: string;
  targetCents: number;
  savedCents: number;
}

export interface DebtLike {
  name: string;
  kind?: string;
  balanceCents: number;
  aprBps: number;
}

export interface PurchaseInput {
  priceCents: number;
  monthlyIncomeCents: number;
  hourlyRateCents: number;
  taxRateBps: number;
  /** Discretionary budget left this month, before this purchase. May be negative. */
  discretionaryRemainingCents: number;
  /** Checking plus savings balances. */
  liquidCents: number;
  /** What the user currently sets aside for goals per month. */
  monthlySavingsCents: number;
  goals: GoalLike[];
  debts?: DebtLike[];
}

export interface GoalImpact {
  name: string;
  remainingCents: number;
  /** This goal's share of the weekly savings pace. */
  weeklyPaceCents: number;
  weeksToGoal: number | null;
  /** Weeks the purchase pushes the goal back if it comes out of savings. */
  delayWeeks: number | null;
}

export interface PurchaseAnalysis {
  priceCents: number;
  afterTaxHourlyCents: number;
  hoursOfWork: number | null;
  percentOfIncome: number | null;
  remainingBeforeCents: number;
  remainingAfterCents: number;
  goalImpacts: GoalImpact[];
  verdict: Verdict;
  reasons: string[];
}

export function afterTaxHourlyCents(hourlyRateCents: number, taxRateBps: number): number {
  const keep = Math.min(10_000, Math.max(0, 10_000 - taxRateBps));
  return Math.round((hourlyRateCents * keep) / 10_000);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function formatWeeks(weeks: number): string {
  if (weeks < 0.1) return "less than a day";
  if (weeks < 1) return `${Math.max(1, Math.round(weeks * 7))} day${Math.round(weeks * 7) === 1 ? "" : "s"}`;
  const w = round1(weeks);
  return `${w} week${w === 1 ? "" : "s"}`;
}

export function discretionaryRemaining(budgets: BudgetLike[], spentByCategory: Record<string, number>): number {
  let total = 0;
  for (const b of budgets) {
    if (ESSENTIAL_CATEGORIES.includes(b.category)) continue;
    total += b.limitCents - (spentByCategory[b.category] ?? 0);
  }
  return total;
}

interface TxLike {
  amountCents: number;
  category: string;
  occurredAt: number;
  merchant?: string;
  status?: string;
}

// How much goes toward goals each month: the average monthly transfer into savings over the
// last 90 days; failing that, the average monthly surplus (income minus spending), never negative.
export function monthlySavingsPace(txs: TxLike[], monthlyIncomeCents: number, now: number): number {
  const since = now - 90 * DAY_MS;
  let transfers = 0;
  let spend = 0;
  for (const t of txs) {
    if (t.occurredAt < since || t.occurredAt > now || t.amountCents >= 0 || t.status === "blocked") continue;
    if (t.category === "transfer") transfers += -t.amountCents;
    else spend += -t.amountCents;
  }
  if (transfers > 0) return Math.round(transfers / 3);
  return Math.max(0, Math.round(monthlyIncomeCents - spend / 3));
}

export function analyzePurchase(input: PurchaseInput): PurchaseAnalysis {
  const price = Math.max(0, Math.round(input.priceCents));
  const hourly = afterTaxHourlyCents(input.hourlyRateCents, input.taxRateBps);
  const hoursOfWork = hourly > 0 ? round1(price / hourly) : null;
  const percentOfIncome = input.monthlyIncomeCents > 0 ? round1((price / input.monthlyIncomeCents) * 100) : null;
  const before = Math.round(input.discretionaryRemainingCents);
  const after = before - price;

  const weeklyTotal = (Math.max(0, input.monthlySavingsCents) * 12) / 52;
  const activeGoals = input.goals.filter((g) => g.targetCents - g.savedCents > 0);
  const share = activeGoals.length > 0 ? weeklyTotal / activeGoals.length : 0;
  const delay = weeklyTotal > 0 ? round1(price / weeklyTotal) : null;
  const goalImpacts: GoalImpact[] = activeGoals.map((g) => {
    const remaining = g.targetCents - g.savedCents;
    return {
      name: g.name,
      remainingCents: remaining,
      weeklyPaceCents: Math.round(share),
      weeksToGoal: share > 0 ? round1(remaining / share) : null,
      delayWeeks: delay,
    };
  });
  const maxDelay = delay ?? 0;

  const reasons: string[] = [];
  const shortfall = Math.max(0, -after);
  const overBudget = after < 0;
  const exceedsCash = price > input.liquidCents;
  const bigShare = percentOfIncome !== null && percentOfIncome >= 5;
  const hugeShare = percentOfIncome !== null && percentOfIncome >= 25;
  const bigShortfall = input.monthlyIncomeCents > 0 && shortfall >= input.monthlyIncomeCents * 0.1;

  if (hoursOfWork !== null) {
    reasons.push(`It costs about ${hoursOfWork} hour${hoursOfWork === 1 ? "" : "s"} of work after tax.`);
  }
  if (percentOfIncome !== null) {
    reasons.push(`That is ${percentOfIncome}% of your monthly income.`);
  }
  if (before <= 0) {
    reasons.push(
      before === 0
        ? "Your discretionary budget is used up this month."
        : `You are already ${formatCents(-before)} over your discretionary budget this month.`,
    );
  } else if (overBudget) {
    reasons.push(
      `You have ${formatCents(before)} of discretionary budget left this month; this puts you ${formatCents(shortfall)} over.`,
    );
  } else {
    reasons.push(`It fits your discretionary budget, leaving ${formatCents(after)} for the rest of the month.`);
  }
  if (exceedsCash) {
    reasons.push(`It is more than the ${formatCents(Math.max(0, input.liquidCents))} you have in checking and savings.`);
  }
  if (delay !== null && activeGoals.length > 0 && price > 0) {
    reasons.push(`If it comes out of savings, each goal slips about ${formatWeeks(delay)} at your current pace.`);
  } else if (activeGoals.length > 0 && price > 0) {
    reasons.push("You are not saving toward goals right now, so there is no pace to measure the delay against.");
  }
  const card = (input.debts ?? []).find((d) => d.balanceCents > 0 && d.aprBps >= 1500);
  if (card && price > 0 && (overBudget || bigShare)) {
    reasons.push(
      `You carry ${formatCents(card.balanceCents)} on ${card.name} at ${(card.aprBps / 100).toFixed(1)}% APR, so paying that down first usually beats a new purchase.`,
    );
  }

  let verdict: Verdict;
  if (exceedsCash || hugeShare || (overBudget && bigShortfall)) verdict = "not_recommended";
  else if (overBudget || bigShare || maxDelay >= 4) verdict = "caution";
  else verdict = "affordable";

  return {
    priceCents: price,
    afterTaxHourlyCents: hourly,
    hoursOfWork,
    percentOfIncome,
    remainingBeforeCents: before,
    remainingAfterCents: after,
    goalImpacts,
    verdict,
    reasons,
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  affordable: "Affordable",
  caution: "Think twice",
  not_recommended: "Not recommended",
};

// Months to clear a balance with a fixed monthly payment. Null when the payment never beats interest.
export function payoffPlan(
  balanceCents: number,
  aprBps: number,
  paymentCents: number,
): { months: number; totalInterestCents: number; totalPaidCents: number } | null {
  if (balanceCents <= 0) return { months: 0, totalInterestCents: 0, totalPaidCents: 0 };
  if (paymentCents <= 0) return null;
  const monthlyRate = aprBps / 10_000 / 12;
  let balance = balanceCents;
  let months = 0;
  let interest = 0;
  while (balance > 0 && months < 1200) {
    const charge = Math.round(balance * monthlyRate);
    if (paymentCents <= charge) return null;
    interest += charge;
    balance += charge;
    balance -= Math.min(paymentCents, balance);
    months++;
  }
  if (balance > 0) return null;
  return { months, totalInterestCents: interest, totalPaidCents: balanceCents + interest };
}
