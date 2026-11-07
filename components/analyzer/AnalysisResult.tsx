import Link from "next/link";
import { Camera, CircleAlert, CircleCheck, CircleX, Clock, PiggyBank, Sparkles, Wallet } from "lucide-react";
import type { StoredAnalysis } from "@/app/app/analyzer/stored";
import { formatCents, formatDateTime } from "@/lib/format";
import { formatWeeks, VERDICT_LABEL, type Verdict } from "@/lib/purchase";

const VERDICT_STYLE: Record<Verdict, { chip: string; panel: string; Icon: typeof CircleCheck }> = {
  affordable: {
    chip: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400",
    panel: "border-green-600/30 bg-green-600/5",
    Icon: CircleCheck,
  },
  caution: {
    chip: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
    panel: "border-amber-500/40 bg-amber-500/5",
    Icon: CircleAlert,
  },
  not_recommended: {
    chip: "border-destructive/40 bg-destructive/10 text-destructive",
    panel: "border-destructive/40 bg-destructive/5",
    Icon: CircleX,
  },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const { chip, Icon } = VERDICT_STYLE[verdict];
  return (
    <span
      data-testid="verdict-chip"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${chip}`}
    >
      <Icon size={13} aria-hidden="true" />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function Stat({ icon, label, value, sub, testId }: { icon: React.ReactNode; label: string; value: string; sub?: string; testId: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3.5" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-bold tracking-tight text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function AnalysisResult({
  item,
  createdAt,
  analysis,
}: {
  item: string;
  createdAt: number;
  analysis: StoredAnalysis;
}) {
  const a = analysis;
  const { panel } = VERDICT_STYLE[a.verdict];
  const remainingAfterNegative = a.remainingAfterCents < 0;

  return (
    <section
      data-testid="analysis-result"
      aria-label={`Analysis of ${item}`}
      className="space-y-5 rounded-2xl border border-border bg-card p-4 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Purchase check</p>
          <h2 className="break-words text-xl font-bold tracking-tight text-foreground" data-testid="result-item">
            {item}
          </h2>
          <p className="text-sm text-muted-foreground">
            <span data-testid="result-price" className="font-semibold text-foreground">
              {formatCents(a.priceCents)}
            </span>{" "}
            · {formatDateTime(createdAt)}
            {a.aiExtracted && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs">
                <Camera size={12} aria-hidden="true" /> read from photo
              </span>
            )}
          </p>
        </div>
        <VerdictChip verdict={a.verdict} />
      </div>

      <div className={`rounded-xl border p-4 ${panel}`} data-testid="verdict-reasons">
        <p className="mb-2 text-sm font-semibold text-foreground">Why: {VERDICT_LABEL[a.verdict]}</p>
        <ul className="space-y-1.5 text-sm text-foreground">
          {a.reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden="true" className="text-muted-foreground">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          testId="stat-hours"
          icon={<Clock size={13} aria-hidden="true" />}
          label="Hours of work"
          value={a.hoursOfWork !== null ? `${a.hoursOfWork} hrs` : "n/a"}
          sub={a.afterTaxHourlyCents > 0 ? `at ${formatCents(a.afterTaxHourlyCents)}/hr after tax` : undefined}
        />
        <Stat
          testId="stat-income"
          icon={<Wallet size={13} aria-hidden="true" />}
          label="Of monthly income"
          value={a.percentOfIncome !== null ? `${a.percentOfIncome}%` : "n/a"}
        />
        <Stat
          testId="stat-budget"
          icon={<PiggyBank size={13} aria-hidden="true" />}
          label="Discretionary left after"
          value={remainingAfterNegative ? `-${formatCents(-a.remainingAfterCents)}` : formatCents(a.remainingAfterCents)}
          sub={`${formatCents(a.remainingBeforeCents)} before this month`}
        />
      </div>

      <div data-testid="goal-impacts">
        <h3 className="text-sm font-semibold text-foreground">Impact on your goals</h3>
        <p className="mb-2 text-xs text-muted-foreground">If it comes out of savings, at your current pace.</p>
        {a.goalImpacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unfinished goals to delay.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {a.goalImpacts.map((g) => (
              <li key={g.name} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm" data-testid="goal-impact">
                <div>
                  <p className="font-medium text-foreground">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCents(g.remainingCents)} to go
                    {g.weeksToGoal !== null ? ` · ${formatWeeks(g.weeksToGoal)} at current pace` : ""}
                  </p>
                </div>
                <p className={`font-semibold ${g.delayWeeks !== null && g.delayWeeks >= 4 ? "text-destructive" : "text-foreground"}`}>
                  {g.delayWeeks !== null ? `+${formatWeeks(g.delayWeeks)}` : "no pace yet"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {a.explanation && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="ai-explanation">
          <div className="mb-1.5 flex items-center gap-2">
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              V
            </span>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Vera says <Sparkles size={13} aria-hidden="true" className="text-primary" />
            </p>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{a.explanation}</p>
        </div>
      )}
    </section>
  );
}

export interface HistoryRow {
  id: string;
  item: string;
  priceCents: number;
  verdict: Verdict;
  createdAt: number;
}

export function CheckHistory({ rows, activeId }: { rows: HistoryRow[]; activeId: string | null }) {
  return (
    <section data-testid="check-history" aria-label="Past purchase checks" className="rounded-2xl border border-border bg-card p-4 md:p-6">
      <h2 className="mb-3 text-base font-semibold text-foreground">Past checks</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="history-empty">
          Nothing checked yet. Your analyses will be saved here so you can re-open them.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} data-testid="history-row" className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {r.item} <span className="font-normal text-muted-foreground">· {formatCents(r.priceCents)}</span>
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <VerdictChip verdict={r.verdict} />
                <Link
                  href={`/app/analyzer?check=${r.id}`}
                  data-testid="history-open"
                  aria-current={r.id === activeId ? "true" : undefined}
                  aria-label={`Re-open ${r.item}`}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    r.id === activeId
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {r.id === activeId ? "Viewing" : "Re-open"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
