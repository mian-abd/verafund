import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { decisions, type Decision } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";

// The audit trail for the decision layer: every typed question Jev answered, and every
// call the rules made without it, with how long it took.

const PURPOSE_LABEL: Record<string, string> = {
  agent_intent: "Vera understood a request",
  agent_confirm: "Vera checked your yes or no",
  subscription_detect: "Subscription check",
  fraud_triage: "Fraud triage",
};

const ENGINE_STYLE: Record<Decision["engine"], { label: string; className: string }> = {
  jev: { label: "Jev", className: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300" },
  rules: { label: "Rules", className: "border-border bg-muted text-muted-foreground" },
  llm: { label: "LLM", className: "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300" },
};

function pct(n: unknown): string | null {
  return typeof n === "number" && n >= 0 && n <= 1 ? `${Math.round(n * 100)}%` : null;
}

// One readable line from the logged output. Shapes differ by purpose; fall back to raw JSON.
export function summarizeDecision(purpose: string, raw: string): string {
  let out: Record<string, unknown>;
  try {
    out = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return raw.slice(0, 140);
  }
  if (purpose === "agent_intent" && typeof out.intent === "string") {
    const conf = pct(out.confidence);
    const via = typeof out.source === "string" ? ` via ${out.source}` : "";
    return `→ ${out.intent.replace(/_/g, " ")}${conf ? ` (${conf} sure)` : ""}${via}`;
  }
  if (purpose === "agent_confirm" && typeof out.decision === "string") {
    const p = pct(out.jev);
    return `→ ${out.decision}${p ? ` (Jev: ${p} agreed)` : ""}`;
  }
  if (purpose === "fraud_triage" && typeof out.score === "number") {
    const jev = Array.isArray(out.jev) && out.jev.length ? ` · ${String(out.jev[0])}` : "";
    return `risk ${out.score}/100, ${String(out.severity)}${jev}`;
  }
  if (purpose === "subscription_detect") {
    if (typeof out.note === "string") return out.note;
    if (Array.isArray(out.results)) return `${out.results.length} candidate(s) checked`;
  }
  return JSON.stringify(out).slice(0, 140);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

export async function DecisionLog({ workspaceId }: { workspaceId: string }) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(decisions)
    .where(eq(decisions.workspaceId, workspaceId))
    .orderBy(desc(decisions.createdAt))
    .limit(12);

  const jevRows = rows.filter((r) => r.engine === "jev");

  return (
    <section data-testid="decision-log" className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">How decisions were made</h2>
          <p className="text-sm text-muted-foreground">
            Jev answers typed questions in milliseconds. Rules have the final say and take over when Jev is unavailable.
          </p>
        </div>
        {jevRows.length > 0 && (
          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-800 dark:text-sky-300">
            Jev: {jevRows.length} decision{jevRows.length === 1 ? "" : "s"} · median {median(jevRows.map((r) => r.latencyMs))} ms
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Ask Vera to do something, run &ldquo;Find my subscriptions&rdquo;, or add a purchase on Transactions.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const engine = ENGINE_STYLE[r.engine];
            return (
              <li key={r.id} data-testid="decision-row" className="py-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex items-center gap-2 sm:w-24 shrink-0">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${engine.className}`}>{engine.label}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{r.latencyMs} ms</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{PURPOSE_LABEL[r.purpose] ?? r.purpose}</p>
                  <p className="text-sm text-muted-foreground break-words">
                    <span className="text-foreground/80">&ldquo;{r.input}&rdquo;</span> {summarizeDecision(r.purpose, r.output)}
                  </p>
                </div>
                <time className="text-xs text-muted-foreground shrink-0">{formatDateTime(r.createdAt)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
