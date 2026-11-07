import { describe, expect, it } from "vitest";
import {
  balanceSeries,
  comparePayoff,
  goalPercent,
  goalPlan,
  monthlyInterestCents,
  percentPaidOff,
  priorityOrder,
  simulatePayoff,
  type PayoffDebt,
} from "./payoff";

const DAY = 86_400_000;

const card: PayoffDebt = { id: "card", name: "Card", balanceCents: 68_000, aprBps: 2499, minPaymentCents: 3_500 };
const loan: PayoffDebt = { id: "loan", name: "Loan", balanceCents: 1_240_000, aprBps: 550, minPaymentCents: 13_000 };

describe("monthlyInterestCents", () => {
  it("uses APR/12 on the balance", () => {
    expect(monthlyInterestCents(120_000, 1200)).toBe(1_200); // 12% APR -> 1% a month
    expect(monthlyInterestCents(68_000, 2499)).toBe(1_416); // 680 * 0.2499 / 12 = 14.16
  });
  it("is zero for no balance or no APR", () => {
    expect(monthlyInterestCents(0, 2499)).toBe(0);
    expect(monthlyInterestCents(1000, 0)).toBe(0);
  });
});

describe("simulatePayoff, single debt", () => {
  it("matches the amortization schedule for a fixed payment", () => {
    // $1,000 at 12% APR, $100/month: standard result is 11 payments, about $56 interest.
    const d: PayoffDebt = { id: "a", name: "A", balanceCents: 100_000, aprBps: 1200, minPaymentCents: 10_000 };
    const r = simulatePayoff([d], 0, "avalanche");
    expect(r.feasible).toBe(true);
    expect(r.months).toBe(11);
    expect(r.totalInterestCents).toBeGreaterThan(5_000);
    expect(r.totalInterestCents).toBeLessThan(6_000);
    expect(r.totalPaidCents).toBe(100_000 + r.totalInterestCents);
    expect(r.balances[0]).toBe(100_000);
    expect(r.balances[r.balances.length - 1]).toBe(0);
  });

  it("handles 0% APR without interest", () => {
    const d: PayoffDebt = { id: "a", name: "A", balanceCents: 50_000, aprBps: 0, minPaymentCents: 10_000 };
    const r = simulatePayoff([d], 0, "snowball");
    expect(r.months).toBe(5);
    expect(r.totalInterestCents).toBe(0);
  });

  it("extra payment shortens the payoff and cuts interest", () => {
    const base = simulatePayoff([card], 0, "avalanche");
    const more = simulatePayoff([card], 10_000, "avalanche");
    expect(more.months).toBeLessThan(base.months);
    expect(more.totalInterestCents).toBeLessThan(base.totalInterestCents);
  });

  it("never pays more than the remaining balance", () => {
    const d: PayoffDebt = { id: "a", name: "A", balanceCents: 5_000, aprBps: 1000, minPaymentCents: 20_000 };
    const r = simulatePayoff([d], 50_000, "avalanche");
    expect(r.months).toBe(1);
    expect(r.totalPaidCents).toBe(5_000 + r.totalInterestCents);
  });
});

describe("rolling freed-up minimums", () => {
  it("clears the card first and then the loan, faster than the loan alone", () => {
    const rolled = simulatePayoff([card, loan], 0, "avalanche");
    const loanAlone = simulatePayoff([loan], 0, "avalanche");
    expect(rolled.order.map((o) => o.id)).toEqual(["card", "loan"]);
    // The card's $35 rolls into the loan once the card is gone, so the loan finishes sooner than at $130 flat.
    const loanDoneAt = rolled.order[1].paidOffMonth;
    expect(loanDoneAt).toBeLessThan(loanAlone.months);
  });

  it("pays the freed minimum toward the next debt", () => {
    const a: PayoffDebt = { id: "a", name: "A", balanceCents: 10_000, aprBps: 0, minPaymentCents: 5_000 };
    const b: PayoffDebt = { id: "b", name: "B", balanceCents: 30_000, aprBps: 0, minPaymentCents: 5_000 };
    // Budget is $100/month. 400 total at 100/month is exactly 4 months, which only works if minimums roll.
    const r = simulatePayoff([a, b], 0, "avalanche");
    expect(r.months).toBe(4);
    expect(r.totalInterestCents).toBe(0);
  });
});

describe("avalanche vs snowball", () => {
  const high: PayoffDebt = { id: "h", name: "High APR big", balanceCents: 500_000, aprBps: 2400, minPaymentCents: 10_000 };
  const small: PayoffDebt = { id: "s", name: "Small low APR", balanceCents: 100_000, aprBps: 600, minPaymentCents: 3_000 };

  it("orders priority by APR vs by balance", () => {
    expect(priorityOrder([small, high], "avalanche").map((d) => d.id)).toEqual(["h", "s"]);
    expect(priorityOrder([high, small], "snowball").map((d) => d.id)).toEqual(["s", "h"]);
  });

  it("avalanche never costs more interest than snowball", () => {
    const { avalanche, snowball } = comparePayoff([small, high], 20_000);
    expect(avalanche.totalInterestCents).toBeLessThanOrEqual(snowball.totalInterestCents);
    expect(avalanche.feasible && snowball.feasible).toBe(true);
  });

  it("targets the highest APR first for avalanche", () => {
    // Pay the small one first only under snowball: its clear month is earlier there.
    const { avalanche, snowball } = comparePayoff([small, high], 20_000);
    const smallAv = avalanche.order.find((o) => o.id === "s")!.paidOffMonth;
    const smallSn = snowball.order.find((o) => o.id === "s")!.paidOffMonth;
    expect(smallSn).toBeLessThan(smallAv);
  });

  it("balance only goes down and ends at zero", () => {
    const { avalanche } = comparePayoff([small, high], 20_000);
    for (let i = 1; i < avalanche.balances.length; i++) {
      expect(avalanche.balances[i]).toBeLessThanOrEqual(avalanche.balances[i - 1]);
    }
    expect(avalanche.balances.at(-1)).toBe(0);
    expect(avalanche.balances).toHaveLength(avalanche.months + 1);
  });

  it("builds a merged chart series", () => {
    const { avalanche, snowball } = comparePayoff([small, high], 20_000);
    const rows = balanceSeries(avalanche, snowball);
    expect(rows[0]).toEqual({ month: 0, avalanche: 600_000, snowball: 600_000 });
    expect(rows.at(-1)?.avalanche).toBe(0);
    expect(rows.at(-1)?.snowball).toBe(0);
  });
});

describe("negative amortization guard", () => {
  // Interest is 1% of $10,000 = $100 a month but the minimum is only $50.
  const trap: PayoffDebt = { id: "a", name: "A", balanceCents: 1_000_000, aprBps: 1200, minPaymentCents: 5_000 };

  it("raises a too-small minimum to cover interest so the balance cannot grow", () => {
    const r = simulatePayoff([trap], 0, "avalanche", 24);
    expect(r.negativeAmortizationGuarded).toBe(true);
    for (let i = 1; i < r.balances.length; i++) {
      expect(r.balances[i]).toBeLessThanOrEqual(r.balances[i - 1]);
    }
  });

  it("reports infeasible instead of looping forever", () => {
    const r = simulatePayoff([trap], 0, "avalanche");
    expect(r.feasible).toBe(false);
    expect(r.months).toBe(600);
  });

  it("is feasible when extra money covers the interest", () => {
    const r = simulatePayoff([trap], 20_000, "avalanche");
    expect(r.feasible).toBe(true);
  });
});

describe("edge cases", () => {
  it("returns an empty plan with no debts", () => {
    const r = simulatePayoff([], 10_000, "avalanche");
    expect(r.months).toBe(0);
    expect(r.feasible).toBe(true);
    expect(r.order).toEqual([]);
    expect(r.balances).toEqual([0]);
  });

  it("ignores already paid off debts", () => {
    const r = simulatePayoff([{ ...card, balanceCents: 0 }, loan], 0, "snowball");
    expect(r.order.map((o) => o.id)).toEqual(["loan"]);
  });

  it("treats negative or NaN extra as zero", () => {
    const zero = simulatePayoff([card], 0, "avalanche").months;
    expect(simulatePayoff([card], -500, "avalanche").months).toBe(zero);
    expect(simulatePayoff([card], Number.NaN, "avalanche").months).toBe(zero);
  });
});

describe("percentPaidOff", () => {
  it("is clamped and floored", () => {
    expect(percentPaidOff(68_000, 150_000)).toBe(54);
    expect(percentPaidOff(0, 150_000)).toBe(100);
    expect(percentPaidOff(200_000, 150_000)).toBe(0);
    expect(percentPaidOff(0, 0)).toBe(100);
  });
});

describe("goals", () => {
  const NOW = Date.UTC(2026, 10, 7);
  it("computes the monthly amount to hit the target", () => {
    const plan = goalPlan({ targetCents: 300_000, savedCents: 150_000, dueAt: NOW + 180 * DAY }, NOW);
    expect(plan.kind).toBe("monthly");
    if (plan.kind === "monthly") {
      expect(plan.remainingCents).toBe(150_000);
      expect(plan.monthsLeft).toBe(6);
      expect(plan.perMonthCents).toBe(25_000);
    }
  });
  it("handles complete, no due date and overdue", () => {
    expect(goalPlan({ targetCents: 100, savedCents: 100, dueAt: null }, NOW).kind).toBe("complete");
    expect(goalPlan({ targetCents: 100, savedCents: 10, dueAt: null }, NOW).kind).toBe("no_due_date");
    expect(goalPlan({ targetCents: 100, savedCents: 10, dueAt: NOW - DAY }, NOW).kind).toBe("overdue");
  });
  it("uses at least one month for a near due date", () => {
    const plan = goalPlan({ targetCents: 10_000, savedCents: 0, dueAt: NOW + 2 * DAY }, NOW);
    expect(plan.kind === "monthly" && plan.perMonthCents).toBe(10_000);
  });
  it("clamps percent", () => {
    expect(goalPercent(150, 100)).toBe(100);
    expect(goalPercent(0, 100)).toBe(0);
    expect(goalPercent(34_000, 80_000)).toBe(42);
  });
});
