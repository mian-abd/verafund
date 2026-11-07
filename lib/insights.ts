// Pure calculations behind the Overview dashboard. Everything here takes plain data
// (signed integer cents: income positive, spending negative) plus an explicit `now`
// and returns plain data, so it is easy to test and never reads the real clock.
//
// Calendar maths uses the server's local time, matching `startOfMonth` in finance.ts.
// Forecasts are estimates built from history; the UI labels them as such.

export const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.44;

export type TxLike = {
  merchant: string;
  category: string;
  amountCents: number;
  occurredAt: number;
  status: string;
};

export type TxWithAccount = TxLike & { accountId: string };

// ---------- basics ----------

/** Spending: negative amounts, excluding transfers and blocked attempts. */
export function isSpending(t: Pick<TxLike, "amountCents" | "category" | "status">): boolean {
  return t.amountCents < 0 && t.category !== "transfer" && t.status !== "blocked";
}

/** Income: positive amounts, excluding transfers and blocked attempts. */
export function isIncome(t: Pick<TxLike, "amountCents" | "category" | "status">): boolean {
  return t.amountCents > 0 && t.category !== "transfer" && t.status !== "blocked";
}

export function netWorthCents(accounts: { balanceCents: number }[]): number {
  return accounts.reduce((sum, a) => sum + a.balanceCents, 0);
}

/** Midnight (local) at the start of the month containing `ms`, shifted by `offset` months. */
export function monthStartMs(ms: number, offset = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime();
}

export function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysInMonthOf(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function sumBy<T>(items: T[], pick: (t: T) => number): number {
  let total = 0;
  for (const item of items) total += pick(item);
  return total;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function incomeBetween(txs: TxLike[], from: number, to: number): number {
  let total = 0;
  for (const t of txs) if (t.occurredAt >= from && t.occurredAt < to && isIncome(t)) total += t.amountCents;
  return total;
}

function spendingBetween(txs: TxLike[], from: number, to: number): number {
  let total = 0;
  for (const t of txs) if (t.occurredAt >= from && t.occurredAt < to && isSpending(t)) total -= t.amountCents;
  return total;
}

// ---------- month summary / stats ----------

export type MonthSummary = {
  incomeCents: number;
  spendingCents: number;
  netCents: number;
  /** (income - spending) / income as a percentage; null when no income yet. */
  savingsRatePct: number | null;
  prevIncomeCents: number;
  prevSpendingCents: number;
  prevSavingsRatePct: number | null;
  /** Percentage-point change in savings rate vs last (full) month; null if either is unknown. */
  savingsRateDeltaPts: number | null;
  /** Last month's spending over the same number of days, for a fair like-for-like comparison. */
  prevSpendingSamePeriodCents: number;
  /** % change in spending vs the same period last month; null if last month had none. */
  spendingDeltaPct: number | null;
  /** Day of the month `now` falls on (1-based). */
  dayOfMonth: number;
};

function savingsRate(income: number, spending: number): number | null {
  if (income <= 0) return null;
  return ((income - spending) / income) * 100;
}

export function monthSummary(txs: TxLike[], now: number): MonthSummary {
  const start = monthStartMs(now);
  const nextStart = monthStartMs(now, 1);
  const prevStart = monthStartMs(now, -1);

  const incomeCents = incomeBetween(txs, start, nextStart);
  const spendingCents = spendingBetween(txs, start, nextStart);
  const prevIncomeCents = incomeBetween(txs, prevStart, start);
  const prevSpendingCents = spendingBetween(txs, prevStart, start);

  const samePeriodEnd = Math.min(prevStart + (now - start) + 1, start);
  const prevSpendingSamePeriodCents = spendingBetween(txs, prevStart, samePeriodEnd);

  const rate = savingsRate(incomeCents, spendingCents);
  const prevRate = savingsRate(prevIncomeCents, prevSpendingCents);

  return {
    incomeCents,
    spendingCents,
    netCents: incomeCents - spendingCents,
    savingsRatePct: rate,
    prevIncomeCents,
    prevSpendingCents,
    prevSavingsRatePct: prevRate,
    savingsRateDeltaPts: rate !== null && prevRate !== null ? rate - prevRate : null,
    prevSpendingSamePeriodCents,
    spendingDeltaPct:
      prevSpendingSamePeriodCents > 0 ? ((spendingCents - prevSpendingSamePeriodCents) / prevSpendingSamePeriodCents) * 100 : null,
    dayOfMonth: new Date(now).getDate(),
  };
}

// ---------- income vs spending by month ----------

export type MonthPoint = {
  key: string; // YYYY-MM
  label: string; // "Nov"
  incomeCents: number;
  spendingCents: number;
  /** True when the month is the current one or the history started part-way through it. */
  partial: boolean;
};

/** The last `months` calendar months (oldest first), skipping months before any data exists. */
export function monthlyTotals(txs: TxLike[], now: number, months = 6): MonthPoint[] {
  let earliest = Infinity;
  for (const t of txs) if (t.occurredAt < earliest) earliest = t.occurredAt;
  const currentStart = monthStartMs(now);
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = monthStartMs(now, -i);
    const end = monthStartMs(now, -i + 1);
    if (end <= earliest) continue; // no history yet for this month
    const d = new Date(start);
    const startedLate = earliest > start + 2 * DAY_MS && earliest < end;
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      incomeCents: incomeBetween(txs, start, end),
      spendingCents: spendingBetween(txs, start, end),
      partial: start === currentStart || startedLate,
    });
  }
  return out;
}

// ---------- categories & budgets ----------

export type CategorySpend = { category: string; cents: number };

/** Positive spend per category within [fromMs, toMs), largest first. */
export function categorySpend(txs: TxLike[], fromMs: number, toMs = Infinity): CategorySpend[] {
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (t.occurredAt < fromMs || t.occurredAt >= toMs || !isSpending(t)) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) - t.amountCents);
  }
  return [...totals.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents);
}

export type BudgetRow = {
  category: string;
  limitCents: number;
  spentCents: number;
  pct: number; // unclamped, 0-100+
  over: boolean;
  /** Positive when under budget, negative when over. */
  remainingCents: number;
};

export function budgetProgress(budgets: { category: string; limitCents: number }[], spent: CategorySpend[]): BudgetRow[] {
  const byCategory = new Map(spent.map((s) => [s.category, s.cents]));
  return budgets
    .map((b) => {
      const spentCents = byCategory.get(b.category) ?? 0;
      return {
        category: b.category,
        limitCents: b.limitCents,
        spentCents,
        pct: b.limitCents > 0 ? (spentCents / b.limitCents) * 100 : spentCents > 0 ? 100 : 0,
        over: spentCents > b.limitCents,
        remainingCents: b.limitCents - spentCents,
      };
    })
    .sort((a, b) => b.pct - a.pct);
}

// ---------- recurring detection ----------

export type Cadence = "weekly" | "biweekly" | "monthly";

export type RecurringItem = {
  merchant: string;
  category: string;
  direction: "income" | "expense";
  cadence: Cadence;
  /** Typical amount, positive cents. */
  amountCents: number;
  lastAt: number;
  /** Next expected date (today or later). */
  nextAt: number;
  /** Typical day of the month (monthly cadence only; otherwise day of `nextAt`). */
  dayOfMonth: number;
  occurrences: number;
};

const BANDS: Record<Cadence, [number, number]> = {
  weekly: [6, 8],
  biweekly: [12, 16],
  monthly: [26, 35],
};
const CADENCE_DAYS: Record<Cadence, number> = { weekly: 7, biweekly: 14, monthly: 30 };
const BILL_CATEGORIES = new Set(["housing", "utilities", "subscriptions", "insurance"]);

function advance(ms: number, cadence: Cadence, dayOfMonth: number): number {
  const d = new Date(ms);
  if (cadence === "weekly") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7, d.getHours(), d.getMinutes()).getTime();
  if (cadence === "biweekly") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14, d.getHours(), d.getMinutes()).getTime();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const dim = daysInMonthOf(year, month);
  return new Date(year, month, Math.min(dayOfMonth, dim), d.getHours(), d.getMinutes()).getTime();
}

function detectCadence(intervalsDays: number[]): Cadence | null {
  if (intervalsDays.length === 0) return null;
  const m = median(intervalsDays);
  for (const cadence of ["weekly", "biweekly", "monthly"] as Cadence[]) {
    const [lo, hi] = BANDS[cadence];
    if (m < lo || m > hi) continue;
    const inBand = intervalsDays.filter((x) => x >= lo && x <= hi).length;
    if (inBand / intervalsDays.length >= 0.75) return cadence;
  }
  return null;
}

/**
 * Finds charges and deposits that repeat on a steady schedule (same merchant, similar
 * amount, regular spacing) and works out when each is next expected. Needs at least
 * 2 occurrences for housing/utilities/subscriptions bills and 3 for anything else.
 */
export function detectRecurring(txs: TxLike[], now: number): RecurringItem[] {
  const groups = new Map<string, TxLike[]>();
  for (const t of txs) {
    if (t.status === "blocked" || t.category === "transfer" || t.amountCents === 0) continue;
    const key = `${t.amountCents > 0 ? "in" : "out"}|${t.merchant.trim().toLowerCase()}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const today = startOfDayMs(now);
  const items: RecurringItem[] = [];

  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.occurredAt - b.occurredAt);
    const direction = key.startsWith("in|") ? "income" : "expense";
    const category = sorted[sorted.length - 1].category;

    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) intervals.push((sorted[i].occurredAt - sorted[i - 1].occurredAt) / DAY_MS);
    const cadence = detectCadence(intervals);
    if (!cadence) continue;

    const minOccurrences = cadence === "monthly" && BILL_CATEGORIES.has(category) ? 2 : 3;
    if (sorted.length < minOccurrences) continue;

    const amounts = sorted.map((t) => Math.abs(t.amountCents));
    const typical = median(amounts);
    const tolerance = direction === "income" ? 0.25 : 0.15;
    if (amounts.some((a) => Math.abs(a - typical) > typical * tolerance)) continue;

    const last = sorted[sorted.length - 1];
    // Not seen for more than three cycles: probably cancelled, don't project it.
    if (today - last.occurredAt > CADENCE_DAYS[cadence] * 3 * DAY_MS) continue;

    const dayOfMonth = Math.round(median(sorted.map((t) => new Date(t.occurredAt).getDate())));
    let next = advance(last.occurredAt, cadence, dayOfMonth);
    let guard = 0;
    while (next < today && guard++ < 400) next = advance(next, cadence, dayOfMonth);

    items.push({
      merchant: last.merchant,
      category,
      direction,
      cadence,
      amountCents: Math.round(typical),
      lastAt: last.occurredAt,
      nextAt: next,
      dayOfMonth: cadence === "monthly" ? dayOfMonth : new Date(next).getDate(),
      occurrences: sorted.length,
    });
  }
  return items.sort((a, b) => a.nextAt - b.nextAt);
}

/** Expected dates of a recurring item from its next date up to and including `toMs`. */
export function occurrencesUntil(item: RecurringItem, toMs: number): number[] {
  const out: number[] = [];
  let at = item.nextAt;
  let guard = 0;
  while (at <= toMs && guard++ < 400) {
    out.push(at);
    at = advance(at, item.cadence, item.dayOfMonth);
  }
  return out;
}

/** Expected dates of a recurring item inside [fromMs, toMs). */
export function occurrencesBetween(item: RecurringItem, fromMs: number, toMs: number): number[] {
  return occurrencesUntil(item, toMs - 1).filter((at) => at >= fromMs);
}

export function upcomingBills(recurring: RecurringItem[], now: number, withinDays = 31): RecurringItem[] {
  const end = now + withinDays * DAY_MS;
  return recurring.filter((r) => r.direction === "expense" && r.nextAt <= end).sort((a, b) => a.nextAt - b.nextAt);
}

export function daysUntil(at: number, now: number): number {
  return Math.round((startOfDayMs(at) - startOfDayMs(now)) / DAY_MS);
}

// ---------- discretionary spending ----------

function recurringMerchantSet(recurring: RecurringItem[], direction: "income" | "expense"): Set<string> {
  return new Set(recurring.filter((r) => r.direction === direction).map((r) => r.merchant.trim().toLowerCase()));
}

/** Window of history to learn from: the trailing `windowDays`, but never longer than the data itself. */
function historyWindow(txs: TxLike[], now: number, windowDays: number): { from: number; days: number } {
  let earliest = Infinity;
  for (const t of txs) if (t.occurredAt <= now && t.occurredAt < earliest) earliest = t.occurredAt;
  const wanted = now - windowDays * DAY_MS;
  const from = Number.isFinite(earliest) ? Math.max(wanted, earliest) : wanted;
  // At least a week so one big purchase in a short history does not dominate.
  const days = Math.max(7, (now - from) / DAY_MS);
  return { from, days };
}

/** Everyday (non-recurring) spend per day, by category, in cents. */
export function dailyDiscretionaryByCategory(
  txs: TxLike[],
  now: number,
  recurring: RecurringItem[],
  windowDays = 90,
): Record<string, number> {
  const { from, days } = historyWindow(txs, now, windowDays);
  const skip = recurringMerchantSet(recurring, "expense");
  const totals: Record<string, number> = {};
  for (const t of txs) {
    if (t.occurredAt < from || t.occurredAt > now || !isSpending(t)) continue;
    if (skip.has(t.merchant.trim().toLowerCase())) continue;
    totals[t.category] = (totals[t.category] ?? 0) - t.amountCents;
  }
  for (const k of Object.keys(totals)) totals[k] = totals[k] / days;
  return totals;
}

export function averageDailyDiscretionaryCents(txs: TxLike[], now: number, recurring: RecurringItem[], windowDays = 90): number {
  const perCategory = dailyDiscretionaryByCategory(txs, now, recurring, windowDays);
  return Math.round(sumBy(Object.values(perCategory), (v) => v));
}

// ---------- 30-day cash-flow forecast ----------

export type ForecastEvent = { at: number; merchant: string; amountCents: number }; // signed
export type ForecastPoint = { day: number; at: number; balanceCents: number };

export type CashFlowForecast = {
  points: ForecastPoint[];
  startBalanceCents: number;
  endBalanceCents: number;
  incomeCents: number;
  billsCents: number;
  discretionaryCents: number;
  lowestBalanceCents: number;
  lowestDay: number;
  events: ForecastEvent[];
};

export function forecastCashFlow(input: {
  startBalanceCents: number;
  now: number;
  recurring: RecurringItem[];
  dailyDiscretionaryCents: number;
  days?: number;
}): CashFlowForecast {
  const days = input.days ?? 30;
  const end = input.now + days * DAY_MS;

  const events: ForecastEvent[] = [];
  for (const item of input.recurring) {
    for (const at of occurrencesUntil(item, end)) {
      events.push({ at, merchant: item.merchant, amountCents: item.direction === "income" ? item.amountCents : -item.amountCents });
    }
  }
  events.sort((a, b) => a.at - b.at);

  const points: ForecastPoint[] = [{ day: 0, at: input.now, balanceCents: input.startBalanceCents }];
  let balance = input.startBalanceCents;
  let income = 0;
  let bills = 0;
  let lowest = balance;
  let lowestDay = 0;
  let cursor = 0;
  for (let day = 1; day <= days; day++) {
    const dayEnd = input.now + day * DAY_MS;
    while (cursor < events.length && events[cursor].at <= dayEnd) {
      const e = events[cursor++];
      balance += e.amountCents;
      if (e.amountCents > 0) income += e.amountCents;
      else bills -= e.amountCents;
    }
    balance -= input.dailyDiscretionaryCents;
    points.push({ day, at: dayEnd, balanceCents: balance });
    if (balance < lowest) {
      lowest = balance;
      lowestDay = day;
    }
  }

  return {
    points,
    startBalanceCents: input.startBalanceCents,
    endBalanceCents: balance,
    incomeCents: income,
    billsCents: bills,
    discretionaryCents: input.dailyDiscretionaryCents * days,
    lowestBalanceCents: lowest,
    lowestDay,
    events: events.filter((e) => e.at <= end),
  };
}

// ---------- next-month spending prediction ----------

export type CategoryPrediction = {
  category: string;
  predictedCents: number;
  /** Predicted from recurring bills. */
  fixedCents: number;
  /** Predicted from average everyday spending. */
  variableCents: number;
  /** What actually went out last calendar month (0 if nothing). */
  lastMonthCents: number;
};

export type NextMonthPrediction = {
  monthLabel: string;
  rows: CategoryPrediction[];
  totalCents: number;
  lastMonthTotalCents: number;
};

export function predictNextMonthSpending(txs: TxLike[], now: number, recurring: RecurringItem[], windowDays = 90): NextMonthPrediction {
  const start = monthStartMs(now, 1);
  const end = monthStartMs(now, 2);
  const daysInNext = Math.round((end - start) / DAY_MS);

  const fixed: Record<string, number> = {};
  for (const item of recurring) {
    if (item.direction !== "expense") continue;
    const count = occurrencesBetween(item, start, end).length;
    fixed[item.category] = (fixed[item.category] ?? 0) + count * item.amountCents;
  }

  const variable = dailyDiscretionaryByCategory(txs, now, recurring, windowDays);
  const last = new Map(categorySpend(txs, monthStartMs(now, -1), monthStartMs(now)).map((c) => [c.category, c.cents]));

  const categories = new Set([...Object.keys(fixed), ...Object.keys(variable)]);
  const rows: CategoryPrediction[] = [];
  for (const category of categories) {
    const fixedCents = fixed[category] ?? 0;
    const variableCents = Math.round((variable[category] ?? 0) * daysInNext);
    const predictedCents = fixedCents + variableCents;
    if (predictedCents <= 0) continue;
    rows.push({ category, predictedCents, fixedCents, variableCents, lastMonthCents: last.get(category) ?? 0 });
  }
  rows.sort((a, b) => b.predictedCents - a.predictedCents);

  return {
    monthLabel: new Date(start).toLocaleDateString("en-US", { month: "long" }),
    rows,
    totalCents: sumBy(rows, (r) => r.predictedCents),
    lastMonthTotalCents: sumBy([...last.values()], (v) => v),
  };
}

// ---------- card optimizer ----------

export type CardLike = {
  id: string;
  name: string;
  issuer: string;
  type: string; // "credit" | "debit"
  baseRewardBps: number;
  categoryBonuses: string; // JSON { category: bps }
  annualFeeCents?: number;
};

export type AccountLike = { id: string; type: string; institution: string };

export function parseBonuses(json: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Reward rate in basis points a card earns on a category (the better of bonus and base). */
export function cardRateBps(card: Pick<CardLike, "baseRewardBps" | "categoryBonuses">, category: string): number {
  const bonus = parseBonuses(card.categoryBonuses)[category];
  return Math.max(card.baseRewardBps, bonus ?? 0);
}

/** Which card a spending account most likely pays with: same issuer, debit for bank accounts, credit for credit accounts. */
export function cardForAccount(account: AccountLike, cards: CardLike[]): CardLike | null {
  const wantType = account.type === "credit" ? "credit" : "debit";
  const issuer = account.institution.trim().toLowerCase();
  const match = cards.find((c) => c.type === wantType && c.issuer.trim().toLowerCase() === issuer);
  return match ?? null;
}

export type CardOptimizerRow = {
  category: string;
  monthlySpendCents: number;
  bestCardName: string | null;
  bestBps: number;
  usedCardName: string | null;
  usedBps: number;
  actualRewardsCents: number;
  optimalRewardsCents: number;
  missedCents: number;
};

export type CardOptimizer = {
  rows: CardOptimizerRow[];
  actualRewardsCents: number;
  optimalRewardsCents: number;
  missedCents: number;
};

/** Categories where paying by card is not realistic (rent) are skipped by default. */
export const DEFAULT_REWARD_EXCLUSIONS = ["housing", "transfer", "income"];

export function optimizeCards(input: {
  txs: TxWithAccount[];
  accounts: AccountLike[];
  cards: CardLike[];
  now: number;
  windowDays?: number;
  exclude?: string[];
}): CardOptimizer {
  const { txs, accounts, cards, now } = input;
  const exclude = new Set(input.exclude ?? DEFAULT_REWARD_EXCLUSIONS);
  const accountCard = new Map<string, CardLike | null>(accounts.map((a) => [a.id, cardForAccount(a, cards)]));
  const { from, days } = historyWindow(txs, now, input.windowDays ?? 90);
  const scale = AVG_MONTH_DAYS / days;

  type Agg = { spend: number; actual: number; byCard: Map<string, { card: CardLike | null; spend: number }> };
  const perCategory = new Map<string, Agg>();
  for (const t of txs) {
    if (t.occurredAt < from || t.occurredAt > now || !isSpending(t) || exclude.has(t.category)) continue;
    const spend = -t.amountCents;
    const card = accountCard.get(t.accountId) ?? null;
    const agg = perCategory.get(t.category) ?? { spend: 0, actual: 0, byCard: new Map() };
    agg.spend += spend;
    agg.actual += card ? (spend * cardRateBps(card, t.category)) / 10_000 : 0;
    const cardKey = card?.id ?? "none";
    const entry = agg.byCard.get(cardKey) ?? { card, spend: 0 };
    entry.spend += spend;
    agg.byCard.set(cardKey, entry);
    perCategory.set(t.category, agg);
  }

  const rows: CardOptimizerRow[] = [];
  for (const [category, agg] of perCategory) {
    let best: CardLike | null = null;
    let bestBps = 0;
    for (const card of cards) {
      const bps = cardRateBps(card, category);
      const better =
        bps > bestBps ||
        (bps === bestBps && best !== null && bps > 0 && (card.annualFeeCents ?? 0) < (best.annualFeeCents ?? 0));
      if (better) {
        best = card;
        bestBps = bps;
      }
    }
    let used: { card: CardLike | null; spend: number } | null = null;
    for (const entry of agg.byCard.values()) if (!used || entry.spend > used.spend) used = entry;

    const monthlySpendCents = Math.round(agg.spend * scale);
    const optimal = Math.round(((agg.spend * bestBps) / 10_000) * scale);
    const actual = Math.round(agg.actual * scale);
    rows.push({
      category,
      monthlySpendCents,
      bestCardName: best ? best.name : null,
      bestBps,
      usedCardName: used?.card ? used.card.name : null,
      usedBps: used?.card ? cardRateBps(used.card, category) : 0,
      actualRewardsCents: actual,
      optimalRewardsCents: optimal,
      missedCents: Math.max(0, optimal - actual),
    });
  }
  rows.sort((a, b) => b.missedCents - a.missedCents || b.monthlySpendCents - a.monthlySpendCents);

  return {
    rows,
    actualRewardsCents: sumBy(rows, (r) => r.actualRewardsCents),
    optimalRewardsCents: sumBy(rows, (r) => r.optimalRewardsCents),
    missedCents: sumBy(rows, (r) => r.missedCents),
  };
}

// ---------- goals ----------

/** Roughly how much to set aside per month to hit a goal by its due date; null when not applicable. */
export function goalMonthlyNeedCents(goal: { targetCents: number; savedCents: number; dueAt: number | null }, now: number): number | null {
  const remaining = goal.targetCents - goal.savedCents;
  if (remaining <= 0 || goal.dueAt === null) return null;
  const months = Math.max(1, (goal.dueAt - now) / (AVG_MONTH_DAYS * DAY_MS));
  return Math.ceil(remaining / months);
}
