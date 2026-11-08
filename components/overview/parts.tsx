// Small presentational pieces for the Overview page (server-renderable).

import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { DeltaChip, StatTile } from "@/components/Page";

export function Card({
  title,
  subtitle,
  action,
  aside,
  badge,
  testId,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
  /** Anything that belongs in the header's right edge, such as a chart legend. */
  aside?: ReactNode;
  badge?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className={`surface min-w-0 p-5 sm:p-6 ${className}`}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            {title}
            {badge && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {badge}
              </span>
            )}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {(aside || action) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {aside}
            {action && (
              <Link
                href={action.href}
                className="group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {action.label}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

/** A legend that lives in the card header: colored dot plus label. */
export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex items-center gap-4 text-xs font-medium text-muted-foreground" aria-hidden="true">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function Stat({
  label,
  value,
  testId,
  icon,
  children,
}: {
  label: string;
  value: string;
  testId: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <StatTile label={label} value={value} testId={testId} icon={icon}>
      {children}
    </StatTile>
  );
}

/**
 * Delta chip with an arrow, plus the sentence that explains it. `good` decides the color;
 * direction comes from the sign of `delta`. `figure` is the short number shown in the chip.
 */
export function Trend({
  delta,
  good,
  figure,
  children,
}: {
  delta: number;
  good: boolean;
  figure: string;
  children: ReactNode;
}) {
  const flat = Math.abs(delta) < 0.05;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <DeltaChip direction={flat ? "flat" : delta > 0 ? "up" : "down"} good={good}>
        {figure}
      </DeltaChip>
      <span className="text-muted-foreground">{children}</span>
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  posted: "bg-success/10 text-success",
  pending: "bg-warning/10 text-warning",
  flagged: "bg-primary/10 text-primary",
  blocked: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      data-testid={`status-${status}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${style}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
      {status}
    </span>
  );
}

export function ProgressBar({
  pct,
  label,
  tone = "primary",
}: {
  pct: number;
  label: string;
  tone?: "primary" | "danger" | "success";
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const fill =
    tone === "danger"
      ? "bg-gradient-to-r from-destructive/80 to-destructive"
      : tone === "success"
        ? "bg-gradient-to-r from-income/75 to-income"
        : "bg-gradient-to-r from-primary/80 to-primary";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="h-2 w-full overflow-hidden rounded-full bg-muted shadow-[inset_0_1px_1px_rgba(0,0,0,0.06)]"
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Empty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon ?? <Inbox className="h-[18px] w-[18px]" aria-hidden="true" />}
      </span>
      <p className="max-w-xs text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function EstimateNote({ children }: { children: ReactNode }) {
  return <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
