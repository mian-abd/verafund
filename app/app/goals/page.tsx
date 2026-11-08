import { PiggyBank, Receipt, Scale } from "lucide-react";
import { ErrorBanner } from "@/components/guard";
import { PageHeader, SectionHeading, StatTile } from "@/components/Page";
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
      className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success"
    >
      {message}
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
      <PageHeader
        title="Goals, debt and budgets"
        description="Save for what matters, pay debt down faster and stay inside your monthly limits."
      />

      <ErrorBanner message={error} />
      <Notice message={notice} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="goals-summary">
        <StatTile label="Saved toward goals" value={formatCents(saved)} hint={`of ${formatCents(target)} target`} icon={<PiggyBank size={16} aria-hidden="true" />} tone="success" />
        <StatTile label="Total debt" value={formatCents(owed)} hint={`${debts.length} ${debts.length === 1 ? "account" : "accounts"}`} icon={<Scale size={16} aria-hidden="true" />} />
        <StatTile label={`Spent in ${monthLabel}`} value={formatCents(budgetSpent)} hint={`of ${formatCents(budgetLimit)} budgeted`} icon={<Receipt size={16} aria-hidden="true" />} />
      </div>

      <GoalsSection goals={goals} now={now} />

      <section data-testid="debts-section" aria-labelledby="debts-heading" className="space-y-4">
        <SectionHeading id="debts-heading" title="Debt" description="Record payments as you make them and see the fastest way out." />
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
        <SectionHeading
          id="budgets-heading"
          title="Budgets"
          description={`Month-to-date spending for ${monthLabel}, excluding transfers and blocked charges.`}
        />
        <BudgetsList budgets={budgets} spend={spend} />
      </section>
    </div>
  );
}
