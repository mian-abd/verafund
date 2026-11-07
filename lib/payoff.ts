// Pure debt-payoff and savings-goal math. Money is integer cents, APR is basis points
// (2499 = 24.99%). No I/O, no clock: callers pass everything in.

export type PayoffDebt = {
  id: string;
  name: string;
  balanceCents: number;
  aprBps: number;
  minPaymentCents: number;
};

export type Strategy = "avalanche" | "snowball";

export type PayoffOrderEntry = { id: string; name: string; paidOffMonth: number };

export type PayoffResult = {
  strategy: Strategy;
  /** Months until every debt is at zero (or `maxMonths` when not feasible). */
  months: number;
  totalInterestCents: number;
  totalPaidCents: number;
  /** Debts in the order they reach zero. */
  order: PayoffOrderEntry[];
  /** Total balance after each month; index 0 is the starting balance. */
  balances: number[];
  /** False if the debts are not cleared within `maxMonths`. */
  feasible: boolean;
  /** True if any minimum payment was raised because it did not cover the month's interest. */
  negativeAmortizationGuarded: boolean;
};

export const MAX_PAYOFF_MONTHS = 600; // 50 years

/** One month of interest at APR/12, rounded to the nearest cent. */
export function monthlyInterestCents(balanceCents: number, aprBps: number): number {
  if (balanceCents <= 0 || aprBps <= 0) return 0;
  return Math.round((balanceCents * aprBps) / 10_000 / 12);
}

/** The order extra money is thrown at debts: fixed from the starting balances. */
export function priorityOrder(debts: PayoffDebt[], strategy: Strategy): PayoffDebt[] {
  const live = debts.filter((d) => d.balanceCents > 0);
  const byName = (a: PayoffDebt, b: PayoffDebt) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return [...live].sort((a, b) => {
    if (strategy === "avalanche") {
      return b.aprBps - a.aprBps || a.balanceCents - b.balanceCents || byName(a, b);
    }
    return a.balanceCents - b.balanceCents || b.aprBps - a.aprBps || byName(a, b);
  });
}

/**
 * Simulates paying off all debts month by month.
 *
 * Each month: interest accrues on every open debt (monthly compounding), then the budget is
 * paid out. The budget is the sum of ALL original minimums plus `extraCents`, and stays
 * constant, so the minimum of a debt that has been cleared rolls into the next target.
 * Every open debt first gets its minimum, then the remainder goes to the priority debt.
 *
 * Negative amortization guard: a debt's required payment is never less than that month's
 * interest, so a balance can never grow because of a too-small minimum. If that pushes the
 * required total above the budget, the budget is raised for that month.
 */
export function simulatePayoff(
  debts: PayoffDebt[],
  extraCents: number,
  strategy: Strategy,
  maxMonths: number = MAX_PAYOFF_MONTHS,
): PayoffResult {
  const extra = Number.isFinite(extraCents) ? Math.max(0, Math.round(extraCents)) : 0;
  const order = priorityOrder(debts, strategy);
  const balance = new Map<string, number>(order.map((d) => [d.id, d.balanceCents]));
  const baseBudget = order.reduce((s, d) => s + Math.max(0, d.minPaymentCents), 0) + extra;

  const balances: number[] = [order.reduce((s, d) => s + d.balanceCents, 0)];
  const paidOff: PayoffOrderEntry[] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  let guarded = false;
  let month = 0;

  while (month < maxMonths && order.some((d) => (balance.get(d.id) ?? 0) > 0)) {
    month += 1;

    // 1. Interest accrues.
    const interest = new Map<string, number>();
    for (const d of order) {
      const b = balance.get(d.id) ?? 0;
      const i = monthlyInterestCents(b, d.aprBps);
      interest.set(d.id, i);
      balance.set(d.id, b + i);
      totalInterest += i;
    }

    // 2. Required payment per open debt: its minimum, never below this month's interest.
    const open = order.filter((d) => (balance.get(d.id) ?? 0) > 0);
    const pay = new Map<string, number>();
    let required = 0;
    for (const d of open) {
      const b = balance.get(d.id) ?? 0;
      const i = interest.get(d.id) ?? 0;
      let p = Math.max(0, d.minPaymentCents);
      if (p < i) {
        p = i;
        guarded = true;
      }
      p = Math.min(p, b);
      pay.set(d.id, p);
      required += p;
    }

    // 3. Everything above the required payments goes to the priority debt(s).
    let spare = Math.max(0, baseBudget - required);
    for (const d of open) {
      if (spare <= 0) break;
      const b = balance.get(d.id) ?? 0;
      const room = b - (pay.get(d.id) ?? 0);
      const add = Math.min(room, spare);
      if (add > 0) {
        pay.set(d.id, (pay.get(d.id) ?? 0) + add);
        spare -= add;
      }
    }

    // 4. Apply payments.
    for (const d of open) {
      const p = pay.get(d.id) ?? 0;
      const next = (balance.get(d.id) ?? 0) - p;
      balance.set(d.id, next);
      totalPaid += p;
      if (next <= 0) paidOff.push({ id: d.id, name: d.name, paidOffMonth: month });
    }

    balances.push(order.reduce((s, d) => s + (balance.get(d.id) ?? 0), 0));
  }

  const feasible = !order.some((d) => (balance.get(d.id) ?? 0) > 0);
  return {
    strategy,
    months: month,
    totalInterestCents: totalInterest,
    totalPaidCents: totalPaid,
    order: paidOff,
    balances,
    feasible,
    negativeAmortizationGuarded: guarded,
  };
}

export function comparePayoff(debts: PayoffDebt[], extraCents: number) {
  return {
    avalanche: simulatePayoff(debts, extraCents, "avalanche"),
    snowball: simulatePayoff(debts, extraCents, "snowball"),
  };
}

/** Merges both balance series into rows for a chart: { month, avalanche, snowball } in cents. */
export function balanceSeries(avalanche: PayoffResult, snowball: PayoffResult) {
  const len = Math.max(avalanche.balances.length, snowball.balances.length);
  const rows: { month: number; avalanche: number; snowball: number }[] = [];
  for (let m = 0; m < len; m++) {
    rows.push({
      month: m,
      avalanche: avalanche.balances[m] ?? 0,
      snowball: snowball.balances[m] ?? 0,
    });
  }
  return rows;
}

export function percentPaidOff(balanceCents: number, originalCents: number): number {
  if (originalCents <= 0) return balanceCents <= 0 ? 100 : 0;
  const pct = ((originalCents - balanceCents) / originalCents) * 100;
  return Math.max(0, Math.min(100, Math.floor(pct)));
}

// ---------- savings goals ----------

const MONTH_MS = 30.4375 * 86_400_000;

export type GoalPlan =
  | { kind: "complete" }
  | { kind: "no_due_date"; remainingCents: number }
  | { kind: "overdue"; remainingCents: number }
  | { kind: "monthly"; remainingCents: number; monthsLeft: number; perMonthCents: number };

/** What it takes to reach a goal by its due date, relative to the app's clock `nowMs`. */
export function goalPlan(
  goal: { targetCents: number; savedCents: number; dueAt: number | null },
  nowMs: number,
): GoalPlan {
  const remainingCents = Math.max(0, goal.targetCents - goal.savedCents);
  if (remainingCents === 0) return { kind: "complete" };
  if (goal.dueAt === null) return { kind: "no_due_date", remainingCents };
  if (goal.dueAt <= nowMs) return { kind: "overdue", remainingCents };
  const monthsLeft = Math.max(1, Math.ceil((goal.dueAt - nowMs) / MONTH_MS));
  return { kind: "monthly", remainingCents, monthsLeft, perMonthCents: Math.ceil(remainingCents / monthsLeft) };
}

export function goalPercent(savedCents: number, targetCents: number): number {
  if (targetCents <= 0) return 100;
  return Math.max(0, Math.min(100, Math.floor((savedCents / targetCents) * 100)));
}
