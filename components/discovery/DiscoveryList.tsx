"use client";

import { useState } from "react";
import { ShieldCheck, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { guardSelectedAction } from "@/app/app/discovery-actions";
import { MerchantLogo } from "@/components/MerchantLogo";
import { SubmitButton } from "@/components/ui";
import { confidenceLabel } from "@/lib/discovery-core";
import { formatCents, formatShortDate } from "@/lib/format";

// What the server hands over for each recurring charge: plain data only.
export interface DiscoveryRow {
  key: string;
  merchant: string;
  category: string;
  amountCents: number;
  cycle: "monthly" | "yearly";
  occurrences: number;
  nextExpectedAt: number;
  confidence: number;
  reason: string;
  source: "rules" | "rules+jev";
  alreadyGuarded: boolean;
  priceChanged: boolean;
  previousAmountCents: number | null;
  group: "subscription" | "bill";
}

type Tone = "ok" | "info" | "warn" | "muted" | "brand";

const TONES: Record<Tone, string> = {
  ok: "bg-green-600/10 text-green-700 dark:text-green-400 border-green-600/30",
  info: "bg-blue-600/10 text-blue-700 dark:text-blue-300 border-blue-600/30",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40",
  muted: "bg-muted text-muted-foreground border-border",
  brand: "bg-primary/10 text-primary border-primary/30",
};

function Chip({ tone, testId, children }: { tone: Tone; testId?: string; children: React.ReactNode }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

function ConfidenceChip({ confidence }: { confidence: number }) {
  const label = confidenceLabel(confidence);
  const tone: Tone = label === "High" ? "ok" : label === "Medium" ? "info" : "muted";
  return (
    <Chip tone={tone} testId="discovery-confidence">
      {label} confidence
    </Chip>
  );
}

function Row({ row, id, checked, onToggle }: { row: DiscoveryRow; id: string; checked: boolean; onToggle: () => void }) {
  const cycle = row.cycle === "monthly" ? "mo" : "yr";
  const wentUp = row.previousAmountCents !== null && row.amountCents > row.previousAmountCents;
  return (
    <li
      data-testid="discovery-row"
      data-merchant={row.merchant}
      data-guarded={row.alreadyGuarded ? "true" : "false"}
      className="flex items-start gap-3 px-4 py-3"
    >
      <input
        id={id}
        type="checkbox"
        name="merchant"
        value={row.merchant}
        checked={checked}
        disabled={row.alreadyGuarded}
        onChange={onToggle}
        aria-describedby={`${id}-reason`}
        className="mt-2.5 h-4 w-4 flex-shrink-0 accent-[var(--color-primary)] disabled:opacity-40"
      />
      <MerchantLogo name={row.merchant} size={36} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label htmlFor={id} className="text-sm font-semibold text-foreground">
            {row.merchant}
          </label>
          {row.alreadyGuarded && (
            <Chip tone="ok" testId="discovery-guarded">
              <ShieldCheck size={12} aria-hidden="true" /> Already guarded
            </Chip>
          )}
          {row.priceChanged && (
            <Chip tone={wentUp ? "warn" : "muted"} testId="discovery-price-change">
              {wentUp ? <TrendingUp size={12} aria-hidden="true" /> : <TrendingDown size={12} aria-hidden="true" />}
              {wentUp ? "Price went up" : "Price went down"}
            </Chip>
          )}
          <ConfidenceChip confidence={row.confidence} />
          {row.source === "rules+jev" && (
            <Chip tone="brand" testId="discovery-jev">
              <Sparkles size={12} aria-hidden="true" /> Checked by Jev
            </Chip>
          )}
        </div>
        <p className="text-sm text-foreground tabular-nums">
          {formatCents(row.amountCents)}/{cycle} · {row.occurrences} charges · next about {formatShortDate(row.nextExpectedAt)}
        </p>
        <p id={`${id}-reason`} className="text-xs text-muted-foreground">
          {row.reason}
        </p>
      </div>
    </li>
  );
}

function Group({
  title,
  hint,
  rows,
  ids,
  selected,
  toggle,
}: {
  title: string;
  hint?: string;
  rows: DiscoveryRow[];
  ids: Map<string, string>;
  selected: Set<string>;
  toggle: (key: string) => void;
}) {
  if (rows.length === 0) return null;
  const headingId = `discovery-group-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div>
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-background">
        {rows.map((row) => (
          <Row key={row.key} row={row} id={ids.get(row.key)!} checked={selected.has(row.key)} onToggle={() => toggle(row.key)} />
        ))}
      </ul>
    </section>
  );
}

export function DiscoveryList({ rows }: { rows: DiscoveryRow[] }) {
  // New subscriptions start checked, so the common case is one click. Bills start unchecked.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.alreadyGuarded && r.group === "subscription").map((r) => r.key)),
  );
  const ids = new Map(rows.map((r, i) => [r.key, `discovery-pick-${i}`]));
  const available = rows.filter((r) => !r.alreadyGuarded);
  const count = rows.filter((r) => selected.has(r.key) && !r.alreadyGuarded).length;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Not-yet-guarded first, then the most certain.
  const order = (a: DiscoveryRow, b: DiscoveryRow) =>
    Number(a.alreadyGuarded) - Number(b.alreadyGuarded) || b.confidence - a.confidence || b.amountCents - a.amountCents;
  const subscriptions = rows.filter((r) => r.group === "subscription").sort(order);
  const bills = rows.filter((r) => r.group === "bill").sort(order);

  return (
    <form action={guardSelectedAction} className="space-y-5">
      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {available.length} not guarded yet. Tick the ones to guard.
          </p>
          <button
            type="button"
            onClick={() => setSelected(new Set(available.map((r) => r.key)))}
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      <Group title="Subscriptions" rows={subscriptions} ids={ids} selected={selected} toggle={toggle} />
      <Group
        title="Recurring bills"
        hint="Rent, utilities and phone bills aren't subscriptions you can cancel, but you can still cap them so a surprise increase is declined."
        rows={bills}
        ids={ids}
        selected={selected}
        toggle={toggle}
      />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          pendingText="Guarding…"
          data-testid="guard-selected"
          // Spread only when disabling: SubmitButton's own pending-disable must survive otherwise.
          {...(count === 0 ? { disabled: true } : {})}
        >
          Guard selected ({count})
        </SubmitButton>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Each one gets its own virtual card, limited to its latest price.
        </p>
      </div>
    </form>
  );
}
