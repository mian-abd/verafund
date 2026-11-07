// Server-rendered sections of the Overview page. Charts live in client components.

import { AlertTriangle, CheckCircle2, CreditCard } from "lucide-react";
import { MerchantLogo } from "@/components/MerchantLogo";
import { formatCents, formatDate, formatShortDate } from "@/lib/format";
import {
  daysUntil,
  goalMonthlyNeedCents,
  type BudgetRow,
  type CardOptimizer,
  type CashFlowForecast,
  type MonthSummary,
  type NextMonthPrediction,
  type RecurringItem,
} from "@/lib/insights";
import { CashFlowChart } from "./CashFlowChart";
import { GoalIcon } from "./GoalIcon";
import { categoryColor, categoryLabel } from "./categories";
import { Card, Empty, EstimateNote, ProgressBar, Stat, StatusBadge, Trend } from "./parts";

const pct1 = (n: number) => `${n.toFixed(1)}%`;

// ---------- quick stats ----------

export function StatsRow({
  netWorthCents,
  accountCount,
  summary,
}: {
  netWorthCents: number;
  accountCount: number;
  summary: MonthSummary;
}) {
  const s = summary;
  return (
    <div data-testid="overview-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Net worth" value={formatCents(netWorthCents)} testId="stat-net-worth">
        Across {accountCount} account{accountCount === 1 ? "" : "s"}
      </Stat>
      <Stat label="Income this month" value={formatCents(s.incomeCents)} testId="stat-income">
        Last month: {formatCents(s.prevIncomeCents)}
      </Stat>
      <Stat label="Spending this month" value={formatCents(s.spendingCents)} testId="stat-spending">
        {s.spendingDeltaPct === null ? (
          <>Month to date</>
        ) : (
          <Trend delta={s.spendingDeltaPct} good={s.spendingDeltaPct <= 0}>
            {Math.abs(s.spendingDeltaPct).toFixed(0)}% {s.spendingDeltaPct <= 0 ? "less" : "more"} than the same days last month
          </Trend>
        )}
      </Stat>
      <Stat
        label="Savings rate"
        value={s.savingsRatePct === null ? "—" : pct1(s.savingsRatePct)}
        testId="stat-savings-rate"
      >
        {s.savingsRatePct === null ? (
          <>No income yet this month</>
        ) : s.savingsRateDeltaPts === null ? (
          <>Month to date</>
        ) : (
          <Trend delta={s.savingsRateDeltaPts} good={s.savingsRateDeltaPts >= 0}>
            {Math.abs(s.savingsRateDeltaPts).toFixed(1)} pts {s.savingsRateDeltaPts >= 0 ? "above" : "below"} last month
            {s.prevSavingsRatePct !== null && ` (${pct1(s.prevSavingsRatePct)})`}
          </Trend>
        )}
      </Stat>
    </div>
  );
}

// ---------- budgets ----------

export function BudgetsCard({ rows, monthLabel }: { rows: BudgetRow[]; monthLabel: string }) {
  const overCount = rows.filter((r) => r.over).length;
  return (
    <Card
      title="Budgets"
      subtitle={`${monthLabel} so far, spend versus monthly budget`}
      testId="overview-budgets"
    >
      {rows.length === 0 ? (
        <Empty>No budgets set yet.</Empty>
      ) : (
        <>
          {overCount > 0 && (
            <p
              role="status"
              className="mb-4 flex items-center gap-2 rounded-xl border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {overCount} categor{overCount === 1 ? "y is" : "ies are"} over budget this month.
            </p>
          )}
          <ul className="space-y-4">
            {rows.map((r) => (
              <li key={r.category} data-testid={`budget-${r.category}`} data-over={r.over ? "true" : "false"}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ background: categoryColor(r.category) }}
                      aria-hidden="true"
                    />
                    <span className="truncate font-medium text-foreground">{categoryLabel(r.category)}</span>
                  </span>
                  <span className="flex-shrink-0 tabular-nums text-muted-foreground">
                    <span className={r.over ? "font-semibold text-red-700 dark:text-red-400" : "text-foreground"}>
                      {formatCents(r.spentCents)}
                    </span>{" "}
                    / {formatCents(r.limitCents)}
                  </span>
                </div>
                <ProgressBar
                  pct={r.pct}
                  tone={r.over ? "danger" : r.pct >= 85 ? "primary" : "success"}
                  label={`${categoryLabel(r.category)} budget used`}
                />
                <p className={`mt-1 text-xs ${r.over ? "font-medium text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>
                  {r.over
                    ? `Over budget by ${formatCents(-r.remainingCents)}`
                    : `${formatCents(r.remainingCents)} left · ${Math.round(r.pct)}% used`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

// ---------- recent transactions ----------

export type RecentTx = {
  id: string;
  merchant: string;
  category: string;
  amountCents: number;
  occurredAt: number;
  status: string;
};

export function RecentTransactions({ items }: { items: RecentTx[] }) {
  return (
    <Card
      title="Recent transactions"
      subtitle="Your latest activity"
      action={{ href: "/app/transactions", label: "View all transactions" }}
      testId="overview-recent-transactions"
    >
      {items.length === 0 ? (
        <Empty>No transactions yet.</Empty>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((t) => {
            const income = t.amountCents > 0;
            const blocked = t.status === "blocked";
            return (
              <li key={t.id} data-testid="recent-tx-row" className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <MerchantLogo name={t.merchant} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{t.merchant}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {categoryLabel(t.category)} · {formatShortDate(t.occurredAt)}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      blocked
                        ? "text-muted-foreground line-through"
                        : income
                          ? "text-green-700 dark:text-green-400"
                          : "text-foreground"
                    }`}
                  >
                    {income ? "+" : ""}
                    {formatCents(t.amountCents)}
                  </span>
                  <StatusBadge status={t.status} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------- goals ----------

export type GoalItem = {
  id: string;
  name: string;
  icon: string;
  targetCents: number;
  savedCents: number;
  dueAt: number | null;
};

export function GoalsSummary({ goals, now }: { goals: GoalItem[]; now: number }) {
  return (
    <Card
      title="Goals"
      subtitle="Progress toward what you are saving for"
      action={{ href: "/app/goals", label: "View goals" }}
      testId="overview-goals"
    >
      {goals.length === 0 ? (
        <Empty>No goals yet. Create one on the goals page.</Empty>
      ) : (
        <ul className="space-y-5">
          {goals.map((g) => {
            const pct = g.targetCents > 0 ? (g.savedCents / g.targetCents) * 100 : 0;
            const done = g.savedCents >= g.targetCents;
            const need = goalMonthlyNeedCents(g, now);
            return (
              <li key={g.id} data-testid="goal-row">
                <div className="mb-1.5 flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-light-accent text-primary">
                    <GoalIcon name={g.icon} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{g.name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {formatCents(g.savedCents)} of {formatCents(g.targetCents)}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {Math.min(100, Math.round(pct))}%
                  </span>
                </div>
                <ProgressBar pct={pct} tone={done ? "success" : "primary"} label={`${g.name} progress`} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {done
                    ? "Goal reached"
                    : g.dueAt
                      ? `Due ${formatDate(g.dueAt)}${need ? ` · about ${formatCents(need)}/mo to stay on track (estimate)` : ""}`
                      : "No due date"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------- upcoming bills ----------

function dueLabel(at: number, now: number): string {
  const d = daysUntil(at, now);
  if (d <= 0) return "Due today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

export function UpcomingBills({
  bills,
  nextPayday,
  now,
}: {
  bills: RecurringItem[];
  nextPayday: RecurringItem | null;
  now: number;
}) {
  const total = bills.reduce((s, b) => s + b.amountCents, 0);
  return (
    <Card
      title="Upcoming bills"
      subtitle="Recurring charges inferred from your history, next 30 days"
      testId="overview-bills"
    >
      {bills.length === 0 ? (
        <Empty>No recurring bills detected yet. They show up once a charge repeats on a regular schedule.</Empty>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {bills.map((b) => (
              <li key={b.merchant} data-testid="bill-row" className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <MerchantLogo name={b.merchant} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{b.merchant}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {categoryLabel(b.category)} ·{" "}
                    {b.cadence === "monthly" ? `usually around the ${ordinal(b.dayOfMonth)}` : b.cadence}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">{formatCents(b.amountCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShortDate(b.nextAt)} · {dueLabel(b.nextAt, now)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">Expected in the next 30 days</span>
            <span className="font-semibold tabular-nums text-foreground" data-testid="bills-total">
              {formatCents(total)}
            </span>
          </div>
        </>
      )}
      {nextPayday && (
        <p className="mt-3 text-xs text-muted-foreground">
          Next expected paycheck: <span className="font-medium text-foreground">{nextPayday.merchant}</span>,{" "}
          {formatCents(nextPayday.amountCents)} on {formatShortDate(nextPayday.nextAt)}.
        </p>
      )}
    </Card>
  );
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// ---------- insight: cash-flow forecast ----------

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`truncate text-base font-semibold tabular-nums ${
          tone === "bad" ? "text-red-700 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function ForecastCard({
  forecast,
  dailyDiscretionaryCents,
  now,
}: {
  forecast: CashFlowForecast;
  dailyDiscretionaryCents: number;
  now: number;
}) {
  const f = forecast;
  const dips = f.lowestBalanceCents < 0;
  const lowestWhen = f.lowestDay === 0 ? "today" : formatShortDate(now + f.lowestDay * 86_400_000);
  const data = f.points.map((p) => ({
    day: p.day,
    label: p.day === 0 ? "Today" : formatShortDate(p.at),
    balanceCents: p.balanceCents,
  }));
  return (
    <Card
      title="30-day cash-flow forecast"
      subtitle="Projected balance across all accounts"
      badge="Estimate"
      testId="insight-forecast"
    >
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <MiniStat label="Today" value={formatCents(f.startBalanceCents)} />
        <MiniStat label="Balance in 30 days" value={formatCents(f.endBalanceCents)} tone={f.endBalanceCents < 0 ? "bad" : undefined} />
        <MiniStat label="Expected income" value={`+${formatCents(f.incomeCents)}`} />
        <MiniStat label="Bills due" value={`-${formatCents(f.billsCents)}`} />
        <MiniStat label="Everyday spending" value={`-${formatCents(f.discretionaryCents)}`} />
      </div>
      <CashFlowChart data={data} />
      <p
        role="status"
        className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
          dips
            ? "border border-red-600/30 bg-red-600/10 font-medium text-red-700 dark:text-red-400"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {dips ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" aria-hidden="true" />
        )}
        <span>
          {dips
            ? `Heads up: your balance could dip below zero around ${lowestWhen}.`
            : `Lowest projected point is ${formatCents(f.lowestBalanceCents)} (${lowestWhen}), so no shortfall is expected.`}
        </span>
      </p>
      <EstimateNote>
        Estimate, not a guarantee. It starts from today&apos;s balance across all accounts (card balances included), adds
        paychecks and subtracts bills detected from your history, and assumes about {formatCents(dailyDiscretionaryCents)} a
        day of everyday spending based on your recent average. One-off purchases are not predicted.
      </EstimateNote>
    </Card>
  );
}

// ---------- insight: next-month prediction ----------

export function PredictionCard({
  prediction,
  budgetLimits,
  lastMonthLabel,
}: {
  prediction: NextMonthPrediction;
  budgetLimits: Record<string, number>;
  lastMonthLabel: string;
}) {
  const p = prediction;
  const max = Math.max(1, ...p.rows.map((r) => r.predictedCents));
  const delta = p.totalCents - p.lastMonthTotalCents;
  return (
    <Card
      title={`${p.monthLabel} spending prediction`}
      subtitle="By category, from bills plus average everyday spending"
      badge="Estimate"
      testId="insight-prediction"
    >
      {p.rows.length === 0 ? (
        <Empty>Not enough history yet to predict next month.</Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold tabular-nums text-foreground" data-testid="prediction-total">
              ~{formatCents(p.totalCents)}
            </span>
            {p.lastMonthTotalCents > 0 && (
              <Trend delta={delta} good={delta <= 0}>
                {formatCents(Math.abs(delta))} {delta <= 0 ? "less" : "more"} than {lastMonthLabel} ({formatCents(p.lastMonthTotalCents)})
              </Trend>
            )}
          </div>
          <ul className="space-y-3">
            {p.rows.map((r) => {
              const limit = budgetLimits[r.category];
              const overBudget = limit !== undefined && r.predictedCents > limit;
              return (
                <li key={r.category} data-testid={`prediction-${r.category}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ background: categoryColor(r.category) }}
                        aria-hidden="true"
                      />
                      <span className="truncate text-foreground">{categoryLabel(r.category)}</span>
                    </span>
                    <span className="flex-shrink-0 tabular-nums font-medium text-foreground">~{formatCents(r.predictedCents)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(r.predictedCents / max) * 100}%`, background: categoryColor(r.category) }}
                    />
                  </div>
                  {overBudget && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Likely over its {formatCents(limit)} budget
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <EstimateNote>
        Estimate. Recurring bills are counted at their usual amounts; everything else uses your daily average over the
        last 90 days (or all the history there is).
      </EstimateNote>
    </Card>
  );
}

// ---------- insight: card optimizer ----------

export function CardOptimizerCard({ result }: { result: CardOptimizer }) {
  const r = result;
  const bps = (n: number) => `${(n / 100).toFixed(n % 100 === 0 ? 0 : 1)}%`;
  return (
    <Card
      title="Card rewards optimizer"
      subtitle="Which card earns the most in each category"
      badge="Estimate"
      testId="insight-cards"
    >
      {r.rows.length === 0 ? (
        <Empty>Add cards and some spending history to see which card to use where.</Empty>
      ) : (
        <>
          <div className="mb-4 rounded-xl bg-muted px-4 py-3">
            {r.missedCents > 0 ? (
              <p className="text-sm text-foreground">
                You could be earning about{" "}
                <span className="text-lg font-bold tabular-nums text-primary" data-testid="cards-missed">
                  {formatCents(r.missedCents)}
                </span>{" "}
                more per month by switching cards.
              </p>
            ) : (
              <p className="text-sm text-foreground" data-testid="cards-missed">
                You are already using the best card in every category.
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              Earning about {formatCents(r.actualRewardsCents)} of a possible {formatCents(r.optimalRewardsCents)} a month.
            </p>
          </div>
          <ul className="space-y-3">
            {r.rows.map((row) => (
              <li key={row.category} data-testid={`card-row-${row.category}`} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {categoryLabel(row.category)}{" "}
                    <span className="font-normal text-muted-foreground tabular-nums">({formatCents(row.monthlySpendCents)}/mo)</span>
                  </span>
                  {row.missedCents > 0 ? (
                    <span className="flex-shrink-0 font-semibold tabular-nums text-primary">+{formatCents(row.missedCents)}/mo</span>
                  ) : (
                    <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Optimal
                    </span>
                  )}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CreditCard className="h-3 w-3" aria-hidden="true" />
                    Best: {row.bestCardName ? `${row.bestCardName} (${bps(row.bestBps)})` : "no card"}
                  </span>
                  <span>
                    You use: {row.usedCardName ? `${row.usedCardName} (${bps(row.usedBps)})` : "no matching card"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <EstimateNote>
        Estimate. Assumes each account is paid with its matching card (same bank, debit for checking, credit for credit
        accounts), uses your last 90 days of spending, and leaves out rent. Annual fees and bonus caps are not included.
      </EstimateNote>
    </Card>
  );
}
