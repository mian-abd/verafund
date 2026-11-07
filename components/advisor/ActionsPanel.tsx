"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mic, MessageSquare } from "lucide-react";
import type { WireAction, WireActionStatus, WireMemory } from "@/lib/agent/types";

export type ActionRow = WireAction & { time: string };

const STATUS: Record<WireActionStatus, { label: string; cls: string }> = {
  pending: { label: "Waiting for your OK", cls: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  executed: { label: "Done", cls: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400" },
  cancelled: { label: "Cancelled", cls: "border-border bg-muted text-muted-foreground" },
  failed: { label: "Didn't go through", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  expired: { label: "Timed out", cls: "border-border bg-muted text-muted-foreground" },
};

// Vera's action history, any request still waiting for a yes, and what she remembers.
export function ActionsPanel({ actions, memories }: { actions: ActionRow[]; memories: WireMemory[] }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(body: Record<string, unknown>, id: string) {
    setWorking(id);
    setError(null);
    try {
      const res = await fetch("/api/vera/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "Vera could not do that just now.");
    } catch {
      setError("Vera could not do that just now.");
    } finally {
      setWorking(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4" data-testid="agent-panel">
      <section aria-label="Vera's actions" data-testid="agent-actions" className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Vera’s actions</h2>
          <p className="text-xs text-muted-foreground">
            Ask Vera to cancel, pause or change something. She reads back what she’ll do and nothing happens until you say yes.
          </p>
        </div>
        {error && (
          <p role="alert" className="mx-4 mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        {actions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground" data-testid="agent-actions-empty">
            Nothing yet. Try “cancel Netflix” or “set my food budget to $300” in the chat above.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {actions.map((a) => {
              const st = STATUS[a.status];
              return (
                <li key={a.id} className="space-y-2 px-4 py-3" data-testid="agent-action-row" data-status={a.status}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${st.cls}`} data-testid="agent-action-status">
                      {st.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {a.channel === "voice" ? <Mic size={12} aria-hidden="true" /> : <MessageSquare size={12} aria-hidden="true" />}
                      {a.channel === "voice" ? "by voice" : "in chat"} · {a.time}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{a.summary}</p>
                  {a.text && a.status !== "pending" && <p className="text-sm text-muted-foreground">{a.text}</p>}
                  {a.draft && (
                    <details className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                      <summary className="cursor-pointer font-medium text-foreground">Cancellation message to send</summary>
                      <pre className="mt-2 whitespace-pre-wrap font-sans text-foreground">{a.draft}</pre>
                    </details>
                  )}
                  {a.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid="agent-confirm-yes"
                        disabled={working === a.id}
                        onClick={() => void call({ confirm: a.id, decision: "yes" }, a.id)}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      >
                        <Check size={15} aria-hidden="true" /> {working === a.id ? "Working…" : "Yes, do it"}
                      </button>
                      <button
                        type="button"
                        data-testid="agent-confirm-no"
                        disabled={working === a.id}
                        onClick={() => void call({ confirm: a.id, decision: "no" }, a.id)}
                        className="inline-flex h-10 items-center justify-center rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
                      >
                        No
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="What Vera remembers" data-testid="agent-memories" className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">What Vera remembers</h2>
          <p className="text-xs text-muted-foreground">Say “remember that…” in the chat. Vera uses these in her answers.</p>
        </div>
        {memories.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {memories.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-sm text-foreground">{m.fact}</span>
                <button
                  type="button"
                  data-testid="agent-forget"
                  aria-label={`Forget: ${m.fact}`}
                  disabled={working === m.id}
                  onClick={() => void call({ forgetMemory: m.id }, m.id)}
                  className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
