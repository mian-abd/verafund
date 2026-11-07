// Small presentational pieces for the Overview page (server-renderable).

import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  action,
  badge,
  testId,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
  badge?: string;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={testId} className={`min-w-0 rounded-2xl border border-border bg-card p-5 ${className}`}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
            {title}
            {badge && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {badge}
              </span>
            )}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {action.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: string;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <div data-testid={testId} className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tabular-nums text-foreground sm:text-2xl">{value}</p>
      <div className="mt-1 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

/** Trend text with an arrow. `good` decides the color; direction comes from the sign of `delta`. */
export function Trend({ delta, good, children }: { delta: number; good: boolean; children: ReactNode }) {
  const flat = Math.abs(delta) < 0.05;
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat
    ? "text-muted-foreground"
    : good
      ? "text-green-700 dark:text-green-400"
      : "text-red-700 dark:text-red-400";
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${tone}`}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  posted: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400",
  pending: "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-300",
  flagged: "border-orange-500/40 bg-orange-500/15 text-orange-800 dark:text-orange-300",
  blocked: "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-400",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "border-border bg-muted text-muted-foreground";
  return (
    <span
      data-testid={`status-${status}`}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${style}`}
    >
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
  const fill = tone === "danger" ? "bg-destructive" : tone === "success" ? "bg-green-600" : "bg-primary";
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function EstimateNote({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
