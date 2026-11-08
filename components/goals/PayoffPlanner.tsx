"use client";

import { useId, useMemo, useState } from "react";
import { Mountain, Snowflake, TrendingDown } from "lucide-react";
import { formatCents } from "@/lib/format";
import { balanceSeries, comparePayoff, type PayoffDebt, type PayoffResult } from "@/lib/payoff";
import { PayoffChart } from "./PayoffChart";

const MAX_EXTRA_CENTS = 100_000_000; // $1M a month is plenty

function parseExtra(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(cents) && cents <= MAX_EXTRA_CENTS ? cents : null;
}

function duration(months: number): string {
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const years = `${y} ${y === 1 ? "year" : "years"}`;
  return m === 0 ? years : `${years} ${m} ${m === 1 ? "month" : "months"}`;
}

function debtFreeDate(nowMs: number, months: number): string {
  const d = new Date(nowMs);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function StrategyCard({
  testId,
  title,
  blurb,
  icon,
  result,
  nowMs,
  badge,
}: {
  testId: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  result: PayoffResult;
  nowMs: number;
  badge: string | null;
}) {
  return (
    <div data-testid={testId} className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
          <div>
            <h4 className="text-base font-semibold text-foreground">{title}</h4>
            <p className="text-xs text-muted-foreground">{blurb}</p>
          </div>
        </div>
        {badge && (
          <span className="shrink-0 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
            {badge}
          </span>
        )}
      </div>

      {result.feasible ? (
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-muted-foreground">Debt-free in</dt>
            <dd data-testid={`${testId}-months`} className="text-xl font-semibold tracking-tight tabular-nums text-foreground">
              {duration(result.months)}
            </dd>
            <dd className="text-xs text-muted-foreground">{debtFreeDate(nowMs, result.months)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total interest</dt>
            <dd data-testid={`${testId}-interest`} className="text-xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatCents(result.totalInterestCents)}
            </dd>
            <dd className="text-xs text-muted-foreground">Total paid {formatCents(result.totalPaidCents)}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-warning">
          These payments never clear the debt within 50 years. Add more to the extra payment to cover the interest.
        </p>
      )}

      {result.feasible && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Payoff order</p>
          <ol data-testid={`${testId}-order`} className="mt-1.5 space-y-1.5">
            {result.order.map((o, i) => (
              <li key={o.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                    {i + 1}
                  </span>
                  <span className="truncate text-foreground">{o.name}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">month {o.paidOffMonth}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export function PayoffPlanner({ debts, nowMs }: { debts: PayoffDebt[]; nowMs: number }) {
  const [extraText, setExtraText] = useState("100");
  const inputId = useId();
  const extra = parseExtra(extraText);

  const plan = useMemo(() => {
    if (extra === null) return null;
    const { avalanche, snowball } = comparePayoff(debts, extra);
    return { avalanche, snowball, rows: balanceSeries(avalanche, snowball) };
  }, [debts, extra]);

  const open = debts.filter((d) => d.balanceCents > 0);

  return (
    <div data-testid="payoff-planner" className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight text-foreground">Payoff planner</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Compare paying the highest APR first (avalanche) with the smallest balance first (snowball). Minimum payments
          roll into the next debt as each one is cleared.
        </p>
      </div>

      {open.length === 0 ? (
        <p className="surface p-5 text-sm text-muted-foreground">
          No open debts to plan for. Nice work.
        </p>
      ) : (
        <>
          <div className="surface p-5">
            <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
              Extra monthly payment ($)
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <input
                id={inputId}
                name="extra"
                type="text"
                inputMode="decimal"
                value={extraText}
                onChange={(e) => setExtraText(e.target.value)}
                aria-invalid={extra === null}
                aria-describedby={`${inputId}-hint`}
                className="field w-40 tabular-nums"
              />
              <p id={`${inputId}-hint`} className={`text-xs ${extra === null ? "text-destructive" : "text-muted-foreground"}`}>
                {extra === null
                  ? "Enter an amount like 100 or 75.50."
                  : `On top of ${formatCents(open.reduce((s, d) => s + d.minPaymentCents, 0))} in minimum payments each month.`}
              </p>
            </div>
          </div>

          {plan && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <StrategyCard
                  testId="strategy-avalanche"
                  title="Avalanche"
                  blurb="Highest APR first"
                  icon={<Mountain size={18} aria-hidden="true" />}
                  result={plan.avalanche}
                  nowMs={nowMs}
                  badge={
                    plan.avalanche.feasible && plan.snowball.feasible && plan.avalanche.totalInterestCents < plan.snowball.totalInterestCents
                      ? `Saves ${formatCents(plan.snowball.totalInterestCents - plan.avalanche.totalInterestCents)}`
                      : null
                  }
                />
                <StrategyCard
                  testId="strategy-snowball"
                  title="Snowball"
                  blurb="Smallest balance first"
                  icon={<Snowflake size={18} aria-hidden="true" />}
                  result={plan.snowball}
                  nowMs={nowMs}
                  badge={
                    plan.avalanche.feasible && plan.snowball.feasible && plan.snowball.totalInterestCents < plan.avalanche.totalInterestCents
                      ? `Saves ${formatCents(plan.avalanche.totalInterestCents - plan.snowball.totalInterestCents)}`
                      : null
                  }
                />
              </div>

              {plan.avalanche.feasible &&
                plan.snowball.feasible &&
                plan.avalanche.totalInterestCents === plan.snowball.totalInterestCents &&
                plan.avalanche.months === plan.snowball.months && (
                  <p data-testid="strategies-match" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingDown size={16} aria-hidden="true" />
                    Both strategies pick the same order for your debts, so the results match.
                  </p>
                )}

              {(plan.avalanche.negativeAmortizationGuarded || plan.snowball.negativeAmortizationGuarded) && (
                <p className="text-xs text-muted-foreground">
                  A minimum payment here is lower than its monthly interest, so the planner pays at least the interest
                  each month to keep the balance from growing.
                </p>
              )}

              <div className="surface p-5 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[15px] font-semibold tracking-tight text-foreground">Total debt balance over time</h4>
                  <ul className="flex items-center gap-4 text-xs font-medium text-muted-foreground" aria-hidden="true">
                    <li className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[4px] bg-primary" /> Avalanche
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-[4px] bg-info" /> Snowball
                    </li>
                  </ul>
                </div>
                <PayoffChart rows={plan.rows} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
