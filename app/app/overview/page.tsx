import { CategoryDonut } from "@/components/overview/CategoryDonut";
import { IncomeSpendingChart } from "@/components/overview/IncomeSpendingChart";
import { Card, Empty } from "@/components/overview/parts";
import {
  BudgetsCard,
  CardOptimizerCard,
  ForecastCard,
  GoalsSummary,
  PredictionCard,
  RecentTransactions,
  StatsRow,
  UpcomingBills,
} from "@/components/overview/sections";
import { getFinance } from "@/lib/finance";
import { formatDate } from "@/lib/format";
import {
  averageDailyDiscretionaryCents,
  budgetProgress,
  categorySpend,
  detectRecurring,
  forecastCashFlow,
  monthStartMs,
  monthSummary,
  monthlyTotals,
  netWorthCents,
  optimizeCards,
  predictNextMonthSpending,
  upcomingBills,
} from "@/lib/insights";
import { getWorkspaceId } from "@/lib/session";

const monthName = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "long" });

export default async function OverviewPage() {
  const workspaceId = (await getWorkspaceId())!;
  const f = await getFinance(workspaceId);
  const { now, transactions: txs } = f;

  const summary = monthSummary(txs, now);
  const monthly = monthlyTotals(txs, now, 6);
  const thisMonth = monthStartMs(now);
  const spentByCategory = categorySpend(txs, thisMonth, monthStartMs(now, 1));
  const budgetRows = budgetProgress(f.budgets, spentByCategory);

  const recurring = detectRecurring(txs, now);
  const bills = upcomingBills(recurring, now, 30);
  const nextPayday = recurring.find((r) => r.direction === "income") ?? null;
  const dailyDiscretionary = averageDailyDiscretionaryCents(txs, now, recurring);
  const forecast = forecastCashFlow({
    startBalanceCents: netWorthCents(f.accounts),
    now,
    recurring,
    dailyDiscretionaryCents: dailyDiscretionary,
  });
  const prediction = predictNextMonthSpending(txs, now, recurring);
  const optimizer = optimizeCards({ txs, accounts: f.accounts, cards: f.userCards, now });

  const recent = [...txs].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 8);
  const budgetLimits = Object.fromEntries(f.budgets.map((b) => [b.category, b.limitCents]));
  const firstName = f.profile?.displayName.split(" ")[0];
  const hasPartial = monthly.some((m) => m.partial);

  return (
    <div data-testid="overview-page" className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {firstName ? `Welcome back, ${firstName}` : "Overview"}
        </h1>
        <p className="text-sm text-muted-foreground">Your money at a glance as of {formatDate(now)}.</p>
      </div>

      <StatsRow netWorthCents={netWorthCents(f.accounts)} accountCount={f.accounts.length} summary={summary} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          title="Income vs spending"
          subtitle="By month, last 6 months"
          testId="overview-income-spending"
          className="lg:col-span-3"
        >
          {monthly.length === 0 ? (
            <Empty>No transactions yet.</Empty>
          ) : (
            <>
              <IncomeSpendingChart data={monthly} />
              {hasPartial && (
                <p className="mt-2 text-xs text-muted-foreground">* Partial month: the current month, or one where your history starts part-way through.</p>
              )}
            </>
          )}
        </Card>
        <Card
          title="Spending by category"
          subtitle={`${monthName(now)} so far`}
          testId="overview-category-donut"
          className="lg:col-span-2"
        >
          {spentByCategory.length === 0 ? (
            <Empty>No spending recorded yet this month.</Empty>
          ) : (
            <CategoryDonut slices={spentByCategory} />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BudgetsCard rows={budgetRows} monthLabel={monthName(now)} />
        <UpcomingBills bills={bills} nextPayday={nextPayday} now={now} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <RecentTransactions items={recent} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <GoalsSummary goals={f.goals} now={now} />
        </div>
      </div>

      <section data-testid="overview-insights" aria-labelledby="insights-heading" className="space-y-4">
        <div>
          <h2 id="insights-heading" className="text-lg font-bold tracking-tight text-foreground">
            Insights
          </h2>
          <p className="text-sm text-muted-foreground">
            Forward-looking estimates based on your own history. Treat them as guidance, not promises.
          </p>
        </div>
        <ForecastCard forecast={forecast} dailyDiscretionaryCents={dailyDiscretionary} now={now} />
        <div className="grid gap-6 lg:grid-cols-2">
          <PredictionCard
            prediction={prediction}
            budgetLimits={budgetLimits}
            lastMonthLabel={monthName(monthStartMs(now, -1))}
          />
          <CardOptimizerCard result={optimizer} />
        </div>
      </section>
    </div>
  );
}
