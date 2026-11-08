import { MerchantLogo } from "@/components/MerchantLogo";
import type { Transaction } from "@/lib/db/schema";
import { parseRiskSignals, severityOf, signalLabel, type Severity } from "@/lib/fraud";
import { formatCents, formatDateTime } from "@/lib/format";

const STATUS_STYLES: Record<Transaction["status"], string> = {
  posted: "bg-success/10 text-success",
  pending: "bg-info/10 text-info",
  flagged: "bg-warning/10 text-warning",
  blocked: "bg-destructive/10 text-destructive",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  low: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  high: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: Transaction["status"] }) {
  return (
    <span
      data-testid="tx-status"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status]}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

function RiskDetail({ tx }: { tx: Transaction }) {
  const signals = parseRiskSignals(tx.riskSignals);
  const score = tx.riskScore ?? 0;
  const severity = severityOf(score);
  const body = (
    <ul className="space-y-1.5 text-xs">
      {signals.map((s, i) => (
        <li key={`${s.signal}-${i}`} className="flex items-start gap-2" data-testid="risk-signal">
          <span className="min-w-12 flex-shrink-0 rounded-md bg-card px-1.5 py-0.5 text-center font-mono font-semibold text-foreground">
            {s.points > 0 ? `+${s.points}` : s.points < 0 ? s.points : "info"}
          </span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{signalLabel(s.signal)}.</span> {s.detail}
          </span>
        </li>
      ))}
    </ul>
  );
  const summary = (
    <span className="inline-flex items-center gap-2 text-xs font-semibold" data-testid="risk-score">
      <span className={`rounded-full px-2 py-0.5 ${SEVERITY_STYLES[severity]}`}>
        Risk {score}/100 · {severity}
      </span>
      <span className="font-normal text-muted-foreground">
        {signals.length} signal{signals.length === 1 ? "" : "s"}
      </span>
    </span>
  );

  if (signals.length === 0) return <div className="mt-2">{summary}</div>;
  const open = tx.status === "flagged" || tx.status === "blocked" || severity !== "low";
  return (
    <details open={open} className="well mt-2.5 px-3 py-2" data-testid="risk-detail">
      <summary className="cursor-pointer list-none">{summary}</summary>
      <div className="mt-2">{body}</div>
    </details>
  );
}

export function TransactionRow({ tx, accountName }: { tx: Transaction; accountName: string }) {
  const income = tx.amountCents > 0;
  const amount = `${income ? "+" : "−"}${formatCents(Math.abs(tx.amountCents))}`;
  return (
    <li className="p-4 transition-colors hover:bg-muted/30" data-testid="transaction-row" data-status={tx.status}>
      <div className="flex items-start gap-3">
        <MerchantLogo name={tx.merchant} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 break-words text-sm font-semibold text-foreground">{tx.merchant}</p>
            <p
              className={`text-[15px] font-semibold tabular-nums ${
                income ? "text-success" : tx.status === "blocked" ? "text-muted-foreground line-through" : "text-foreground"
              }`}
              data-testid="tx-amount"
            >
              {amount}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{formatDateTime(tx.occurredAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{accountName}</span>
            <span aria-hidden="true">·</span>
            <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{tx.category}</span>
            <StatusBadge status={tx.status} />
          </div>
          {tx.description && <p className="mt-1 break-words text-xs text-muted-foreground">{tx.description}</p>}
          {tx.riskScore !== null && <RiskDetail tx={tx} />}
        </div>
      </div>
    </li>
  );
}
