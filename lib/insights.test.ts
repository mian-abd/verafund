import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  averageDailyDiscretionaryCents,
  budgetProgress,
  cardForAccount,
  cardRateBps,
  categorySpend,
  daysUntil,
  detectRecurring,
  forecastCashFlow,
  goalMonthlyNeedCents,
  monthSummary,
  monthlyTotals,
  netWorthCents,
  occurrencesBetween,
  optimizeCards,
  parseBonuses,
  predictNextMonthSpending,
  upcomingBills,
  type CardLike,
  type TxLike,
  type TxWithAccount,
} from "./insights";

// Local-time helper so the tests behave the same in any server timezone.
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 11, 7, 12);

function tx(partial: Partial<TxLike> & Pick<TxLike, "merchant" | "amountCents" | "occurredAt">): TxLike {
  return { category: "food", status: "posted", ...partial };
}

describe("basics", () => {
  it("sums account balances including negative credit balances", () => {
    expect(netWorthCents([{ balanceCents: 185000 }, { balanceCents: 420000 }, { balanceCents: -68000 }])).toBe(537000);
    expect(netWorthCents([])).toBe(0);
  });
});

describe("monthSummary", () => {
  const txs: TxLike[] = [
    // last month (October)
    tx({ merchant: "Payroll", category: "income", amountCents: 240000, occurredAt: at(2026, 10, 8) }),
    tx({ merchant: "Rent", category: "housing", amountCents: -87500, occurredAt: at(2026, 10, 1) }),
    tx({ merchant: "Kroger", amountCents: -20000, occurredAt: at(2026, 10, 5) }),
    tx({ merchant: "Kroger", amountCents: -30000, occurredAt: at(2026, 10, 25) }), // after the same-day cutoff
    // this month (November, today is the 7th)
    tx({ merchant: "Payroll", category: "income", amountCents: 120000, occurredAt: at(2026, 11, 5) }),
    tx({ merchant: "Rent", category: "housing", amountCents: -87500, occurredAt: at(2026, 11, 1) }),
    tx({ merchant: "Kroger", amountCents: -5000, occurredAt: at(2026, 11, 3) }),
    // ignored: transfer, blocked spend, blocked income
    tx({ merchant: "Transfer to Savings", category: "transfer", amountCents: -30000, occurredAt: at(2026, 11, 2) }),
    tx({ merchant: "Sketchy", category: "shopping", amountCents: -99900, occurredAt: at(2026, 11, 4), status: "blocked" }),
    tx({ merchant: "Refund", category: "income", amountCents: 50000, occurredAt: at(2026, 11, 4), status: "blocked" }),
  ];

  it("counts income and spending, excluding transfers and blocked", () => {
    const s = monthSummary(txs, NOW);
    expect(s.incomeCents).toBe(120000);
    expect(s.spendingCents).toBe(92500);
    expect(s.netCents).toBe(27500);
    expect(s.prevIncomeCents).toBe(240000);
    expect(s.prevSpendingCents).toBe(137500);
  });

  it("computes savings rate and the change vs last month", () => {
    const s = monthSummary(txs, NOW);
    expect(s.savingsRatePct).toBeCloseTo((27500 / 120000) * 100, 5);
    expect(s.prevSavingsRatePct).toBeCloseTo((102500 / 240000) * 100, 5);
    expect(s.savingsRateDeltaPts).toBeCloseTo(s.savingsRatePct! - s.prevSavingsRatePct!, 5);
  });

  it("compares spending with the same number of days last month", () => {
    const s = monthSummary(txs, NOW);
    // Oct 1-7 only: rent 87500 + groceries 20000
    expect(s.prevSpendingSamePeriodCents).toBe(107500);
    expect(s.spendingDeltaPct).toBeCloseTo(((92500 - 107500) / 107500) * 100, 5);
  });

  it("returns null rates when there is no income", () => {
    const s = monthSummary([tx({ merchant: "Kroger", amountCents: -5000, occurredAt: at(2026, 11, 3) })], NOW);
    expect(s.savingsRatePct).toBeNull();
    expect(s.savingsRateDeltaPts).toBeNull();
    expect(s.spendingDeltaPct).toBeNull();
  });

  it("handles an empty history", () => {
    const s = monthSummary([], NOW);
    expect(s.incomeCents).toBe(0);
    expect(s.spendingCents).toBe(0);
    expect(s.savingsRatePct).toBeNull();
  });
});

describe("monthlyTotals", () => {
  const txs: TxLike[] = [
    tx({ merchant: "Payroll", category: "income", amountCents: 100000, occurredAt: at(2026, 9, 20) }),
    tx({ merchant: "Kroger", amountCents: -4000, occurredAt: at(2026, 9, 21) }),
    tx({ merchant: "Payroll", category: "income", amountCents: 200000, occurredAt: at(2026, 10, 8) }),
    tx({ merchant: "Kroger", amountCents: -9000, occurredAt: at(2026, 10, 9) }),
    tx({ merchant: "Kroger", amountCents: -1000, occurredAt: at(2026, 11, 3) }),
  ];

  it("skips months before data begins and flags partial months", () => {
    const pts = monthlyTotals(txs, NOW, 6);
    expect(pts.map((p) => p.key)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(pts[0]).toMatchObject({ label: "Sep", incomeCents: 100000, spendingCents: 4000, partial: true }); // began on the 20th
    expect(pts[1]).toMatchObject({ incomeCents: 200000, spendingCents: 9000, partial: false });
    expect(pts[2]).toMatchObject({ spendingCents: 1000, partial: true }); // current month
  });

  it("returns nothing for no data", () => {
    expect(monthlyTotals([], NOW)).toEqual([]);
  });
});

describe("categories and budgets", () => {
  const txs: TxLike[] = [
    tx({ merchant: "Kroger", category: "food", amountCents: -3000, occurredAt: at(2026, 11, 2) }),
    tx({ merchant: "Chipotle", category: "food", amountCents: -1500, occurredAt: at(2026, 11, 3) }),
    tx({ merchant: "Amazon", category: "shopping", amountCents: -20000, occurredAt: at(2026, 11, 4) }),
    tx({ merchant: "Old", category: "food", amountCents: -9999, occurredAt: at(2026, 10, 30) }),
    tx({ merchant: "Move", category: "transfer", amountCents: -10000, occurredAt: at(2026, 11, 4) }),
    tx({ merchant: "Blocked", category: "shopping", amountCents: -5000, occurredAt: at(2026, 11, 4), status: "blocked" }),
  ];

  it("groups month spending by category, largest first", () => {
    expect(categorySpend(txs, at(2026, 11, 1))).toEqual([
      { category: "shopping", cents: 20000 },
      { category: "food", cents: 4500 },
    ]);
  });

  it("builds budget progress and flags overspend", () => {
    const rows = budgetProgress(
      [
        { category: "food", limitCents: 46000 },
        { category: "shopping", limitCents: 13000 },
        { category: "transport", limitCents: 9500 },
      ],
      categorySpend(txs, at(2026, 11, 1)),
    );
    expect(rows[0]).toMatchObject({ category: "shopping", over: true, remainingCents: -7000 });
    expect(rows[0].pct).toBeGreaterThan(100);
    const food = rows.find((r) => r.category === "food")!;
    expect(food.over).toBe(false);
    expect(food.remainingCents).toBe(41500);
    expect(rows.find((r) => r.category === "transport")).toMatchObject({ spentCents: 0, pct: 0, over: false });
  });
});

describe("detectRecurring", () => {
  const history: TxLike[] = [
    // monthly rent on the 1st, utilities on the 20th, subscription on the 12th
    ...[8, 9, 10, 11].map((m) => tx({ merchant: "Maple Apartments", category: "housing", amountCents: -87500, occurredAt: at(2026, m, 1, 9) })),
    ...[8, 9, 10].map((m) => tx({ merchant: "DTE Energy", category: "utilities", amountCents: -2800, occurredAt: at(2026, m, 20, 8) })),
    ...[8, 9, 10].map((m) => tx({ merchant: "Netflix", category: "subscriptions", amountCents: -1599, occurredAt: at(2026, m, 12, 7) })),
    // biweekly payroll
    ...[0, 14, 28, 42, 56, 70, 84].map((d) => tx({ merchant: "Campus IT - Payroll", category: "income", amountCents: 120000, occurredAt: at(2026, 8, 13, 10) + d * DAY_MS })),
    // noise: groceries with varying amounts must not count as recurring
    tx({ merchant: "Kroger", amountCents: -4000, occurredAt: at(2026, 9, 3) }),
    tx({ merchant: "Kroger", amountCents: -9000, occurredAt: at(2026, 10, 3) }),
    tx({ merchant: "Kroger", amountCents: -2500, occurredAt: at(2026, 11, 3) }),
    // transfers never count
    ...[8, 9, 10].map((m) => tx({ merchant: "Transfer to Savings", category: "transfer", amountCents: -30000, occurredAt: at(2026, m, 28) })),
  ];

  const items = detectRecurring(history, NOW);
  const by = (merchant: string) => items.find((i) => i.merchant === merchant);

  it("finds monthly bills with their next expected date", () => {
    expect(by("Maple Apartments")).toMatchObject({ cadence: "monthly", amountCents: 87500, dayOfMonth: 1, direction: "expense" });
    expect(new Date(by("Maple Apartments")!.nextAt).getMonth()).toBe(11); // December
    expect(new Date(by("Maple Apartments")!.nextAt).getDate()).toBe(1);
    expect(new Date(by("DTE Energy")!.nextAt).getMonth()).toBe(10); // Nov 20
    expect(new Date(by("DTE Energy")!.nextAt).getDate()).toBe(20);
    expect(new Date(by("Netflix")!.nextAt).getMonth()).toBe(10); // Nov 12
    expect(new Date(by("Netflix")!.nextAt).getDate()).toBe(12);
  });

  it("finds biweekly income", () => {
    const pay = by("Campus IT - Payroll")!;
    expect(pay).toMatchObject({ cadence: "biweekly", direction: "income", amountCents: 120000 });
    expect(pay.nextAt).toBeGreaterThanOrEqual(NOW - DAY_MS);
    expect(pay.nextAt - pay.lastAt).toBeGreaterThan(12 * DAY_MS);
  });

  it("ignores irregular spending and transfers", () => {
    expect(by("Kroger")).toBeUndefined();
    expect(by("Transfer to Savings")).toBeUndefined();
  });

  it("does not project items that stopped long ago", () => {
    const old = [8, 9, 10].map((m) => tx({ merchant: "Old Gym", category: "subscriptions", amountCents: -2000, occurredAt: at(2026, m - 5 > 0 ? m - 5 : 1, 5) }));
    expect(detectRecurring(old, at(2026, 11, 7))).toEqual([]);
  });

  it("needs 3 occurrences outside bill categories", () => {
    const two = [9, 10].map((m) => tx({ merchant: "Gadget Club", category: "shopping", amountCents: -2000, occurredAt: at(2026, m, 5) }));
    expect(detectRecurring(two, NOW)).toEqual([]);
    const bill = [9, 10].map((m) => tx({ merchant: "Hulu", category: "subscriptions", amountCents: -1200, occurredAt: at(2026, m, 5) }));
    expect(detectRecurring(bill, NOW)).toHaveLength(1);
  });

  it("lists upcoming bills in date order and counts days away", () => {
    const bills = upcomingBills(items, NOW, 31);
    expect(bills.map((b) => b.merchant)).toEqual(["Netflix", "DTE Energy", "Maple Apartments"]);
    expect(daysUntil(by("Netflix")!.nextAt, NOW)).toBe(5);
    expect(bills.every((b) => b.direction === "expense")).toBe(true);
  });

  it("projects occurrences between two dates", () => {
    const pay = by("Campus IT - Payroll")!;
    const dates = occurrencesBetween(pay, at(2026, 12, 1, 0), at(2026, 12, 31, 0));
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates.length).toBeLessThanOrEqual(3);
  });

  it("clamps month-end days (31st -> shorter months)", () => {
    const monthEnd = [8, 9, 10].map((m) => tx({ merchant: "Storage", category: "subscriptions", amountCents: -5000, occurredAt: at(2026, m, m === 9 ? 30 : 31) }));
    const found = detectRecurring(monthEnd, at(2026, 11, 7))[0];
    expect(found).toBeDefined();
    expect(new Date(found.nextAt).getMonth()).toBe(10);
    expect(new Date(found.nextAt).getDate()).toBeLessThanOrEqual(30);
  });
});

describe("discretionary spend and the 30-day forecast", () => {
  const recurringTx: TxLike[] = [
    ...[8, 9, 10].map((m) => tx({ merchant: "Maple Apartments", category: "housing", amountCents: -100000, occurredAt: at(2026, m, 1) })),
    ...[0, 14, 28, 42, 56, 70, 84].map((d) => tx({ merchant: "Payroll", category: "income", amountCents: 100000, occurredAt: at(2026, 8, 13, 10) + d * DAY_MS })),
  ];
  // $10/day of food over the last 60 days
  const food: TxLike[] = [];
  for (let d = 1; d <= 60; d++) food.push(tx({ merchant: `Cafe ${d % 3}`, amountCents: -1000, occurredAt: NOW - d * DAY_MS }));
  const all = [...recurringTx, ...food];
  const recurring = detectRecurring(all, NOW);

  it("averages everyday spend per day without double counting bills", () => {
    const daily = averageDailyDiscretionaryCents(all, NOW, recurring, 60);
    expect(daily).toBeGreaterThan(900);
    expect(daily).toBeLessThan(1100);
  });

  it("projects the balance from recurring income, bills and daily spend", () => {
    const f = forecastCashFlow({ startBalanceCents: 500000, now: NOW, recurring, dailyDiscretionaryCents: 1000, days: 30 });
    expect(f.points).toHaveLength(31);
    expect(f.points[0].balanceCents).toBe(500000);
    expect(f.discretionaryCents).toBe(30000);
    // two or three paydays, one rent payment on Dec 1
    expect(f.billsCents).toBe(100000);
    expect(f.incomeCents).toBeGreaterThanOrEqual(200000);
    expect(f.incomeCents).toBeLessThanOrEqual(300000);
    expect(f.endBalanceCents).toBe(500000 + f.incomeCents - f.billsCents - f.discretionaryCents);
    expect(f.lowestBalanceCents).toBeLessThanOrEqual(f.endBalanceCents + 1);
    expect(f.events.every((e) => e.at <= NOW + 30 * DAY_MS)).toBe(true);
  });

  it("is just a straight line down with nothing recurring", () => {
    const f = forecastCashFlow({ startBalanceCents: 10000, now: NOW, recurring: [], dailyDiscretionaryCents: 100, days: 30 });
    expect(f.endBalanceCents).toBe(7000);
    expect(f.lowestDay).toBe(30);
    expect(f.incomeCents).toBe(0);
  });

  it("copes with no history at all", () => {
    expect(averageDailyDiscretionaryCents([], NOW, [])).toBe(0);
    expect(detectRecurring([], NOW)).toEqual([]);
  });
});

describe("predictNextMonthSpending", () => {
  const txs: TxLike[] = [
    ...[8, 9, 10, 11].map((m) => tx({ merchant: "Maple Apartments", category: "housing", amountCents: -87500, occurredAt: at(2026, m, 1) })),
    ...[8, 9, 10].map((m) => tx({ merchant: "Netflix", category: "subscriptions", amountCents: -1599, occurredAt: at(2026, m, 12) })),
  ];
  for (let d = 1; d <= 60; d++) txs.push(tx({ merchant: `Cafe ${d % 4}`, category: "food", amountCents: -1000, occurredAt: NOW - d * DAY_MS }));
  const recurring = detectRecurring(txs, NOW);

  it("combines recurring bills with average everyday spending", () => {
    const p = predictNextMonthSpending(txs, NOW, recurring, 60);
    expect(p.monthLabel).toBe("December");
    const housing = p.rows.find((r) => r.category === "housing")!;
    expect(housing).toMatchObject({ fixedCents: 87500, variableCents: 0, predictedCents: 87500 });
    expect(p.rows.find((r) => r.category === "subscriptions")!.fixedCents).toBe(1599);
    const food = p.rows.find((r) => r.category === "food")!;
    // $10/day * 31 days in December
    expect(food.variableCents).toBeGreaterThan(29000);
    expect(food.variableCents).toBeLessThan(33000);
    expect(p.totalCents).toBe(p.rows.reduce((s, r) => s + r.predictedCents, 0));
    expect(p.rows[0].predictedCents).toBeGreaterThanOrEqual(p.rows[1].predictedCents);
  });

  it("reports last month's actuals for comparison", () => {
    const p = predictNextMonthSpending(txs, NOW, recurring, 60);
    expect(p.rows.find((r) => r.category === "housing")!.lastMonthCents).toBe(87500);
    expect(p.lastMonthTotalCents).toBeGreaterThan(87500);
  });

  it("returns an empty prediction without history", () => {
    const p = predictNextMonthSpending([], NOW, []);
    expect(p.rows).toEqual([]);
    expect(p.totalCents).toBe(0);
  });
});

describe("card optimizer", () => {
  const cards: CardLike[] = [
    { id: "disc", name: "Discover it", issuer: "Discover", type: "credit", baseRewardBps: 100, categoryBonuses: JSON.stringify({ food: 500, subscriptions: 500 }) },
    { id: "wf", name: "Active Cash", issuer: "Wells Fargo", type: "credit", baseRewardBps: 200, categoryBonuses: "{}" },
    { id: "deb", name: "WF Debit", issuer: "Wells Fargo", type: "debit", baseRewardBps: 0, categoryBonuses: "{}" },
  ];
  const accounts = [
    { id: "chk", type: "checking", institution: "Wells Fargo" },
    { id: "cc", type: "credit", institution: "Discover" },
  ];

  it("parses bonus JSON defensively", () => {
    expect(parseBonuses('{"food":500,"bad":"x"}')).toEqual({ food: 500 });
    expect(parseBonuses("not json")).toEqual({});
    expect(parseBonuses("[1,2]")).toEqual({});
    expect(parseBonuses("null")).toEqual({});
  });

  it("uses the better of the bonus and base rate", () => {
    expect(cardRateBps(cards[0], "food")).toBe(500);
    expect(cardRateBps(cards[0], "shopping")).toBe(100);
    expect(cardRateBps({ baseRewardBps: 300, categoryBonuses: '{"food":100}' }, "food")).toBe(300);
  });

  it("maps accounts to the matching card", () => {
    expect(cardForAccount(accounts[0], cards)?.id).toBe("deb");
    expect(cardForAccount(accounts[1], cards)?.id).toBe("disc");
    expect(cardForAccount({ id: "x", type: "savings", institution: "Chase" }, cards)).toBeNull();
  });

  it("finds the best card per category and the rewards left on the table", () => {
    const txs: TxWithAccount[] = [];
    // 30 days of history: $300 food on the debit card, $200 shopping on the Discover card, $875 rent
    for (let i = 0; i < 30; i++) txs.push({ ...tx({ merchant: "Kroger", category: "food", amountCents: -1000, occurredAt: NOW - (i + 1) * DAY_MS }), accountId: "chk" });
    for (let i = 0; i < 4; i++) txs.push({ ...tx({ merchant: "Target", category: "shopping", amountCents: -5000, occurredAt: NOW - (i * 7 + 1) * DAY_MS }), accountId: "cc" });
    txs.push({ ...tx({ merchant: "Maple", category: "housing", amountCents: -87500, occurredAt: NOW - 10 * DAY_MS }), accountId: "chk" });

    const result = optimizeCards({ txs, accounts, cards, now: NOW, windowDays: 30 });
    const food = result.rows.find((r) => r.category === "food")!;
    const shopping = result.rows.find((r) => r.category === "shopping")!;

    expect(food.bestCardName).toBe("Discover it");
    expect(food.bestBps).toBe(500);
    expect(food.usedCardName).toBe("WF Debit");
    expect(food.actualRewardsCents).toBe(0);
    expect(food.optimalRewardsCents).toBeGreaterThan(1200); // 5% of about $300/month
    expect(food.missedCents).toBe(food.optimalRewardsCents);

    expect(shopping.bestCardName).toBe("Active Cash"); // 2% beats Discover's 1%
    expect(shopping.usedCardName).toBe("Discover it");
    expect(shopping.missedCents).toBeGreaterThan(0);

    expect(result.rows.find((r) => r.category === "housing")).toBeUndefined(); // rent excluded
    expect(result.missedCents).toBe(food.missedCents + shopping.missedCents);
    expect(result.optimalRewardsCents - result.actualRewardsCents).toBe(result.missedCents);
    expect(result.rows[0].missedCents).toBeGreaterThanOrEqual(result.rows[1].missedCents);
  });

  it("reports nothing missed when the best card is already used", () => {
    const txs: TxWithAccount[] = [{ ...tx({ merchant: "Kroger", category: "food", amountCents: -10000, occurredAt: NOW - DAY_MS }), accountId: "cc" }];
    const result = optimizeCards({ txs, accounts, cards, now: NOW, windowDays: 30 });
    expect(result.missedCents).toBe(0);
    expect(result.rows[0].usedCardName).toBe("Discover it");
  });

  it("handles no cards or no spending", () => {
    expect(optimizeCards({ txs: [], accounts, cards, now: NOW }).rows).toEqual([]);
    const txs: TxWithAccount[] = [{ ...tx({ merchant: "Kroger", amountCents: -1000, occurredAt: NOW - DAY_MS }), accountId: "chk" }];
    const none = optimizeCards({ txs, accounts, cards: [], now: NOW });
    expect(none.missedCents).toBe(0);
    expect(none.rows[0].bestCardName).toBeNull();
  });
});

describe("goalMonthlyNeedCents", () => {
  it("spreads the remaining amount over the months left", () => {
    const need = goalMonthlyNeedCents({ targetCents: 300000, savedCents: 150000, dueAt: NOW + 180 * DAY_MS }, NOW)!;
    expect(need).toBeGreaterThan(24000);
    expect(need).toBeLessThan(26000);
  });
  it("is null when done or without a due date", () => {
    expect(goalMonthlyNeedCents({ targetCents: 100, savedCents: 100, dueAt: NOW + DAY_MS }, NOW)).toBeNull();
    expect(goalMonthlyNeedCents({ targetCents: 100, savedCents: 0, dueAt: null }, NOW)).toBeNull();
  });
  it("asks for everything now when overdue", () => {
    expect(goalMonthlyNeedCents({ targetCents: 10000, savedCents: 2000, dueAt: NOW - DAY_MS }, NOW)).toBe(8000);
  });
});
