"use client";

// One hand-built tooltip for every chart, so hovering feels the same everywhere.

import type { ReactNode } from "react";

export type TooltipRow = { label: string; value: string; color?: string; muted?: boolean };

export type TooltipContent = {
  title: string;
  rows: TooltipRow[];
  /** A highlighted last line, e.g. the net for a month. */
  footer?: { label: string; value: string; tone?: "good" | "bad" | "flat" };
  note?: ReactNode;
};

type RechartsPayload = ReadonlyArray<{ payload?: unknown; name?: unknown; value?: unknown; dataKey?: unknown; color?: string }>;

export function ChartTooltip({
  active,
  payload,
  label,
  build,
}: {
  active?: boolean;
  payload?: RechartsPayload;
  label?: string | number;
  build: (label: string, payload: RechartsPayload) => TooltipContent | null;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const content = build(String(label ?? ""), payload);
  if (!content) return null;
  const tone =
    content.footer?.tone === "good" ? "text-success" : content.footer?.tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="min-w-[176px] rounded-xl border border-border bg-popover px-3.5 py-3 text-xs [box-shadow:var(--shadow-pop)]">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{content.title}</p>
      <ul className="space-y-1.5">
        {content.rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-6">
            <span className={`flex items-center gap-2 ${r.muted ? "text-muted-foreground" : "text-foreground"}`}>
              {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden="true" />}
              {r.label}
            </span>
            <span className="font-semibold tabular-nums text-foreground">{r.value}</span>
          </li>
        ))}
      </ul>
      {content.footer && (
        <div className="mt-2.5 flex items-center justify-between gap-6 border-t border-border pt-2.5">
          <span className="text-muted-foreground">{content.footer.label}</span>
          <span className={`font-semibold tabular-nums ${tone}`}>{content.footer.value}</span>
        </div>
      )}
      {content.note && <p className="mt-2 text-[11px] text-muted-foreground">{content.note}</p>}
    </div>
  );
}
