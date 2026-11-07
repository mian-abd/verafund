import { ErrorBanner } from "@/components/guard";
import { PayoffPlanner } from "@/components/goals/PayoffPlanner";
import { BudgetsList, DebtsList, GoalsSection } from "@/components/goals/sections";
import { getFinance, spendByCategory, startOfMonth } from "@/lib/finance";
import { formatCents } from "@/lib/format";
import { getWorkspaceId } from "@/lib/session";

function Notice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="status"
      data-testid="goals-notice"
      className="rounded-xl border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400"
    >
      {message}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function GoalsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const workspaceId = (await getWorkspaceId())!;
  const finance = await getFinance(workspaceId);
  const { goals, debts, budgets, transactions, now } = finance;

  const spend = spendByCategory(transactions, startOfMonth(now));
  const monthLabel = new Date(now).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });

  const saved = goals.reduce((s, g) => s + g.savedCents, 0);
  const target = goals.reduce((s, g) => s + g.targetCents, 0);
  const owed = debts.reduce((s, d) => s + d.balanceCents, 0);
  const budgetLimit = budgets.reduce((s, b) => s + b.limitCents, 0);
  const budgetSpent = budgets.reduce((s, b) => s + (spend[b.category] ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Goals, debt and budgets</h1>
        <p className="text-sm text-muted-foreground">Save for what matters, pay debt down faster and stay inside your monthly limits.</p>
      </div>

      <ErrorBanner message={error} />
      <Notice message={notice} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="goals-summary">
        <Stat label="Saved toward goals" value={formatCents(saved)} hint={`of ${formatCents(target)} target`} />
        <Stat label="Total debt" value={formatCents(owed)} hint={`${debts.length} ${debts.length === 1 ? "account" : "accounts"}`} />
        <Stat label={`Spent in ${monthLabel}`} value={formatCents(budgetSpent)} hint={`of ${formatCents(budgetLimit)} budgeted`} />
      </div>

      <GoalsSection goals={goals} now={now} />

      <section data-testid="debts-section" aria-labelledby="debts-heading" className="space-y-4">
        <div>
          <h2 id="debts-heading" className="text-xl font-bold tracking-tight text-foreground">
            Debt
          </h2>
          <p className="text-sm text-muted-foreground">Record payments as you make them and see the fastest way out.</p>
        </div>
        <DebtsList debts={debts} />
        <PayoffPlanner
          nowMs={now}
          debts={debts.map((d) => ({
            id: d.id,
            name: d.name,
            balanceCents: d.balanceCents,
            aprBps: d.aprBps,
            minPaymentCents: d.minPaymentCents,
          }))}
        />
      </section>

      <section data-testid="budgets-section" aria-labelledby="budgets-heading" className="space-y-4">
        <div>
          <h2 id="budgets-heading" className="text-xl font-bold tracking-tight text-foreground">
            Budgets
          </h2>
          <p className="text-sm text-muted-foreground">Month-to-date spending for {monthLabel}, excluding transfers and blocked charges.</p>
        </div>
        <BudgetsList budgets={budgets} spend={spend} />
      </section>
    </div>
  );
}
