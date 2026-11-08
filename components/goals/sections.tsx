import { AlertTriangle, CalendarClock, CircleCheck, Plus } from "lucide-react";
import { addGoalAction, addToGoalAction, recordPaymentAction } from "@/app/app/goals/actions";
import { SectionHeading } from "@/components/Page";
import { ReturnTo, SubmitButton } from "@/components/ui";
import type { Budget, Debt, Goal } from "@/lib/db/schema";
import { formatCents, formatDate } from "@/lib/format";
import { goalPercent, goalPlan, percentPaidOff } from "@/lib/payoff";
import { BudgetLimitEditor } from "./BudgetLimitEditor";
import { DeleteGoalButton } from "./DeleteGoalButton";
import { GOAL_ICON_LABELS, GOAL_ICON_NAMES, GoalIcon } from "./icons";
import { ProgressBar, type ProgressTone } from "./Progress";

const DAY = 86_400_000;

const inputClass = "field mt-1";

function MoneyForm({
  action,
  idName,
  idValue,
  label,
  button,
  pendingText,
}: {
  action: (formData: FormData) => void | Promise<void>;
  idName: string;
  idValue: string;
  label: string;
  button: string;
  pendingText: string;
}) {
  const inputId = `${idName}-${idValue}`;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <ReturnTo />
      <input type="hidden" name={idName} value={idValue} />
      <div className="min-w-0 flex-1 basis-32">
        <label htmlFor={inputId} className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
        <input
          id={inputId}
          name="amount"
          type="text"
          inputMode="decimal"
          required
          placeholder="e.g. 50"
          className="field mt-1 tabular-nums"
        />
      </div>
      <SubmitButton pendingText={pendingText}>{button}</SubmitButton>
    </form>
  );
}

// ---------- goals ----------

function GoalCard({ goal, now }: { goal: Goal; now: number }) {
  const pct = goalPercent(goal.savedCents, goal.targetCents);
  const plan = goalPlan(goal, now);
  const complete = plan.kind === "complete";
  const remaining = Math.max(0, goal.targetCents - goal.savedCents);

  return (
    <article data-testid="goal-card" aria-label={goal.name} className="surface flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GoalIcon name={goal.icon} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">{goal.name}</h3>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock size={13} aria-hidden="true" />
            {goal.dueAt ? `Due ${formatDate(goal.dueAt)}` : "No due date"}
          </p>
        </div>
        {complete && (
          <span
            data-testid="goal-reached"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success"
          >
            <CircleCheck size={14} aria-hidden="true" /> Goal reached!
          </span>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-sm text-foreground">
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatCents(goal.savedCents)}</span>{" "}
            <span className="text-muted-foreground">of {formatCents(goal.targetCents)}</span>
          </p>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <ProgressBar percent={pct} tone={complete ? "success" : "primary"} label={`${goal.name} progress`} />
      </div>

      <p data-testid="goal-plan" className="text-sm text-muted-foreground">
        {plan.kind === "complete" && "Fully funded. Nothing more to save."}
        {plan.kind === "no_due_date" && `${formatCents(plan.remainingCents)} to go. Add a due date to see a monthly target.`}
        {plan.kind === "overdue" && `Past its due date with ${formatCents(plan.remainingCents)} still to go.`}
        {plan.kind === "monthly" && (
          <>
            Save <strong className="font-semibold text-foreground">{formatCents(plan.perMonthCents)}/month</strong> for{" "}
            {plan.monthsLeft} {plan.monthsLeft === 1 ? "month" : "months"} to hit your target.
          </>
        )}
      </p>

      {!complete && (
        <MoneyForm
          action={addToGoalAction}
          idName="goalId"
          idValue={goal.id}
          label={`Amount to add to ${goal.name} ($, up to ${formatCents(remaining)})`}
          button="Add money"
          pendingText="Adding…"
        />
      )}

      <div className="-mb-1 border-t border-border pt-3">
        <DeleteGoalButton goalId={goal.id} name={goal.name} />
      </div>
    </article>
  );
}

function AddGoalForm({ now }: { now: number }) {
  const minDate = new Date(now + DAY).toISOString().slice(0, 10);
  return (
    <form
      action={addGoalAction}
      data-testid="add-goal-form"
      className="surface border-dashed p-5 sm:p-6"
    >
      <ReturnTo />
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Plus size={18} aria-hidden="true" /> Add goal
      </h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="goal-name" className="block text-sm font-medium text-foreground">
            Goal name
          </label>
          <input id="goal-name" name="name" type="text" required maxLength={40} placeholder="e.g. Concert tickets" className={inputClass} />
        </div>
        <div>
          <label htmlFor="goal-target" className="block text-sm font-medium text-foreground">
            Target amount ($)
          </label>
          <input
            id="goal-target"
            name="target"
            type="text"
            inputMode="decimal"
            required
            placeholder="e.g. 1500"
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="goal-due" className="block text-sm font-medium text-foreground">
            Due date (optional)
          </label>
          <input id="goal-due" name="dueDate" type="date" min={minDate} className={inputClass} />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-foreground">Icon</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {GOAL_ICON_NAMES.map((name, i) => (
            <label key={name} className="cursor-pointer">
              <input type="radio" name="icon" value={name} defaultChecked={i === 0} className="peer sr-only" />
              <span className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background px-2 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary peer-checked:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <GoalIcon name={name} size={20} />
                {GOAL_ICON_LABELS[name]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5">
        <SubmitButton pendingText="Adding…">Add goal</SubmitButton>
      </div>
    </form>
  );
}

export function GoalsSection({ goals, now }: { goals: Goal[]; now: number }) {
  const ordered = [...goals].sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
  return (
    <section data-testid="goals-section" aria-labelledby="goals-heading" className="space-y-4">
      <SectionHeading id="goals-heading" title="Savings goals" description="Track what you are saving for and what it takes to get there on time." />
      {ordered.length === 0 ? (
        <p className="surface p-5 text-sm text-muted-foreground">
          No goals yet. Add your first one below.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((g) => (
            <GoalCard key={g.id} goal={g} now={now} />
          ))}
        </div>
      )}
      <AddGoalForm now={now} />
    </section>
  );
}

// ---------- debts ----------

const KIND_LABEL: Record<Debt["kind"], string> = {
  credit_card: "Credit card",
  student_loan: "Student loan",
  auto_loan: "Auto loan",
  personal_loan: "Personal loan",
  mortgage: "Mortgage",
};

function DebtCard({ debt }: { debt: Debt }) {
  const paid = percentPaidOff(debt.balanceCents, debt.originalCents);
  const done = debt.balanceCents === 0;
  return (
    <article data-testid="debt-card" aria-label={debt.name} className="surface flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">{debt.name}</h3>
          <p className="text-xs text-muted-foreground">{KIND_LABEL[debt.kind]}</p>
        </div>
        {done ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success">
            <CircleCheck size={14} aria-hidden="true" /> Paid off!
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">
            {(debt.aprBps / 100).toFixed(2)}% APR
          </span>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Balance</dt>
          <dd data-testid="debt-balance" className="text-lg font-semibold tracking-tight tabular-nums text-foreground">
            {formatCents(debt.balanceCents)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Original</dt>
          <dd className="text-lg font-semibold tabular-nums text-foreground">{formatCents(debt.originalCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Minimum</dt>
          <dd className="text-lg font-semibold tabular-nums text-foreground">{formatCents(debt.minPaymentCents)}</dd>
        </div>
      </dl>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Paid off</span>
          <span data-testid="debt-percent" className="font-semibold tabular-nums text-foreground">
            {paid}%
          </span>
        </div>
        <ProgressBar percent={paid} tone="success" label={`${debt.name} paid off`} />
      </div>

      {!done && (
        <MoneyForm
          action={recordPaymentAction}
          idName="debtId"
          idValue={debt.id}
          label={`Payment amount for ${debt.name} ($)`}
          button="Record payment"
          pendingText="Recording…"
        />
      )}
    </article>
  );
}

export function DebtsList({ debts }: { debts: Debt[] }) {
  const ordered = [...debts].sort((a, b) => b.aprBps - a.aprBps || b.balanceCents - a.balanceCents);
  if (ordered.length === 0) {
    return <p className="surface p-5 text-sm text-muted-foreground">No debts on record.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {ordered.map((d) => (
        <DebtCard key={d.id} debt={d} />
      ))}
    </div>
  );
}

// ---------- budgets ----------

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function BudgetRow({ budget, spentCents }: { budget: Budget; spentCents: number }) {
  const ratio = budget.limitCents > 0 ? spentCents / budget.limitCents : 0;
  const pct = Math.round(ratio * 100);
  const over = spentCents > budget.limitCents;
  const tone: ProgressTone = over ? "danger" : ratio >= 0.85 ? "warn" : "primary";
  const diff = Math.abs(budget.limitCents - spentCents);
  const name = capitalize(budget.category);

  return (
    <li
      data-testid="budget-row"
      data-over={over ? "true" : "false"}
      className={`surface p-5 ${over ? "!border-destructive/50 !bg-destructive/5" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">{name}</h3>
          {over && (
            <span
              data-testid="over-budget"
              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive"
            >
              <AlertTriangle size={13} aria-hidden="true" /> Over budget
            </span>
          )}
        </div>
        <p className="text-sm tabular-nums text-foreground">
          <span className={`font-bold ${over ? "text-destructive" : ""}`}>{formatCents(spentCents)}</span>
          <span className="text-muted-foreground"> of {formatCents(budget.limitCents)}</span>
        </p>
      </div>
      <div className="mt-3">
        <ProgressBar percent={pct} tone={tone} label={`${name} spending this month`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm ${over ? "font-medium text-destructive" : "text-muted-foreground"}`}>
          {over ? `Over by ${formatCents(diff)}` : `${formatCents(diff)} left`} · {pct}% used
        </p>
        <BudgetLimitEditor budgetId={budget.id} category={budget.category} limitCents={budget.limitCents} />
      </div>
    </li>
  );
}

export function BudgetsList({ budgets, spend }: { budgets: Budget[]; spend: Record<string, number> }) {
  const ordered = [...budgets].sort((a, b) => b.limitCents - a.limitCents || a.category.localeCompare(b.category));
  if (ordered.length === 0) {
    return <p className="surface p-5 text-sm text-muted-foreground">No budgets set yet.</p>;
  }
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {ordered.map((b) => (
        // Keyed on the limit so the inline editor closes after a successful save.
        <BudgetRow key={`${b.id}:${b.limitCents}`} budget={b} spentCents={spend[b.category] ?? 0} />
      ))}
    </ul>
  );
}
