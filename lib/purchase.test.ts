import { describe, expect, it } from "vitest";
import {
  afterTaxHourlyCents,
  analyzePurchase,
  discretionaryRemaining,
  monthlySavingsPace,
  payoffPlan,
  type PurchaseInput,
} from "./purchase";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 7, 20, 0, 0);

const base: PurchaseInput = {
  priceCents: 4000,
  monthlyIncomeCents: 260000,
  hourlyRateCents: 2000,
  taxRateBps: 1800,
  discretionaryRemainingCents: 10000,
  liquidCents: 600000,
  monthlySavingsCents: 30000,
  goals: [
    { name: "Emergency Fund", targetCents: 300000, savedCents: 150000 },
    { name: "Spring Break Trip", targetCents: 80000, savedCents: 34000 },
    { name: "Done Goal", targetCents: 10000, savedCents: 10000 },
  ],
  debts: [{ name: "Discover it Student", kind: "credit_card", balanceCents: 68000, aprBps: 2499 }],
};

describe("afterTaxHourlyCents", () => {
  it("applies the tax rate", () => {
    expect(afterTaxHourlyCents(2000, 1800)).toBe(1640);
    expect(afterTaxHourlyCents(2000, 0)).toBe(2000);
    expect(afterTaxHourlyCents(2000, 12000)).toBe(0);
  });
});

describe("analyzePurchase", () => {
  it("computes hours, share of income and remaining budget", () => {
    const a = analyzePurchase({ ...base, priceCents: 16400 });
    expect(a.afterTaxHourlyCents).toBe(1640);
    expect(a.hoursOfWork).toBe(10);
    expect(a.percentOfIncome).toBe(6.3);
    expect(a.remainingBeforeCents).toBe(10000);
    expect(a.remainingAfterCents).toBe(-6400);
  });

  it("rates a small, in-budget purchase as affordable", () => {
    const a = analyzePurchase(base);
    expect(a.verdict).toBe("affordable");
    expect(a.reasons.some((r) => r.includes("fits your discretionary budget"))).toBe(true);
  });

  it("flags caution when it blows the monthly budget a little", () => {
    const a = analyzePurchase({ ...base, priceCents: 15000, discretionaryRemainingCents: 10000 });
    expect(a.verdict).toBe("caution");
  });

  it("is not recommended when it exceeds cash on hand", () => {
    const a = analyzePurchase({ ...base, priceCents: 120000, liquidCents: 50000 });
    expect(a.verdict).toBe("not_recommended");
  });

  it("is not recommended when it is a quarter of income", () => {
    const a = analyzePurchase({ ...base, priceCents: 70000 });
    expect(a.verdict).toBe("not_recommended");
  });

  it("is not recommended when it overshoots the budget by 10% of income", () => {
    const a = analyzePurchase({ ...base, priceCents: 40000, discretionaryRemainingCents: 5000 });
    expect(a.verdict).toBe("not_recommended");
  });

  it("delays each unfinished goal by price over weekly savings pace", () => {
    const a = analyzePurchase({ ...base, priceCents: 30000 });
    // $300/month saved = about $69.23/week, split across 2 unfinished goals
    expect(a.goalImpacts).toHaveLength(2);
    expect(a.goalImpacts[0].delayWeeks).toBe(4.3);
    expect(a.goalImpacts[0].weeklyPaceCents).toBe(3462);
    expect(a.goalImpacts[1].weeksToGoal).toBe(13.3);
  });

  it("handles no savings pace without dividing by zero", () => {
    const a = analyzePurchase({ ...base, monthlySavingsCents: 0 });
    expect(a.goalImpacts.every((g) => g.delayWeeks === null && g.weeksToGoal === null)).toBe(true);
  });

  it("handles a zero hourly rate and zero income", () => {
    const a = analyzePurchase({ ...base, hourlyRateCents: 0, monthlyIncomeCents: 0 });
    expect(a.hoursOfWork).toBeNull();
    expect(a.percentOfIncome).toBeNull();
  });

  it("mentions high-APR debt when the purchase strains the budget", () => {
    const a = analyzePurchase({ ...base, priceCents: 20000 });
    expect(a.reasons.some((r) => r.includes("Discover it Student"))).toBe(true);
  });

  it("reports an already overspent budget", () => {
    const a = analyzePurchase({ ...base, discretionaryRemainingCents: -2500 });
    expect(a.reasons.some((r) => r.includes("already $25.00 over"))).toBe(true);
    expect(a.verdict).toBe("caution");
  });
});

describe("discretionaryRemaining", () => {
  it("ignores essential categories and nets spending", () => {
    const budgets = [
      { category: "housing", limitCents: 90000 },
      { category: "food", limitCents: 46000 },
      { category: "entertainment", limitCents: 7000 },
      { category: "shopping", limitCents: 13000 },
    ];
    expect(discretionaryRemaining(budgets, { housing: 87500, entertainment: 3000, shopping: 15000 })).toBe(2000);
  });
});

describe("monthlySavingsPace", () => {
  it("averages transfers to savings over 90 days", () => {
    const txs = [
      { amountCents: -30000, category: "transfer", occurredAt: NOW - 60 * DAY },
      { amountCents: -30000, category: "transfer", occurredAt: NOW - 30 * DAY },
      { amountCents: -30000, category: "transfer", occurredAt: NOW - 2 * DAY },
      { amountCents: -30000, category: "transfer", occurredAt: NOW - 120 * DAY },
    ];
    expect(monthlySavingsPace(txs, 260000, NOW)).toBe(30000);
  });

  it("falls back to income minus spending, never negative", () => {
    const spend = [{ amountCents: -300000, category: "food", occurredAt: NOW - 10 * DAY }];
    expect(monthlySavingsPace(spend, 260000, NOW)).toBe(160000);
    const heavy = [{ amountCents: -3000000, category: "food", occurredAt: NOW - 10 * DAY }];
    expect(monthlySavingsPace(heavy, 260000, NOW)).toBe(0);
  });
});

describe("payoffPlan", () => {
  it("amortizes a balance", () => {
    const plan = payoffPlan(68000, 2499, 3500);
    expect(plan).not.toBeNull();
    expect(plan!.months).toBeGreaterThan(24);
    expect(plan!.months).toBeLessThan(28);
    expect(plan!.totalPaidCents).toBe(68000 + plan!.totalInterestCents);
    expect(plan!.totalInterestCents).toBeGreaterThan(0);
  });

  it("pays faster with a bigger payment", () => {
    expect(payoffPlan(68000, 2499, 10000)!.months).toBeLessThan(payoffPlan(68000, 2499, 3500)!.months);
  });

  it("returns null when the payment never covers interest", () => {
    expect(payoffPlan(1_000_000, 2499, 1000)).toBeNull();
    expect(payoffPlan(10000, 1200, 0)).toBeNull();
  });

  it("handles zero interest and zero balance", () => {
    expect(payoffPlan(10000, 0, 2500)).toEqual({ months: 4, totalInterestCents: 0, totalPaidCents: 10000 });
    expect(payoffPlan(0, 1200, 2500)!.months).toBe(0);
  });
});
