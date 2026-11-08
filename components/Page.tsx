// Small server-safe building blocks shared by the app pages: page header, chips, section headings.

import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5 !text-primary">{eyebrow}</p>}
        <h1 className="text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export type ChipTone = "success" | "warning" | "info" | "danger" | "muted" | "brand";

const CHIP_TONES: Record<ChipTone, string> = {
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-info/25 bg-info/10 text-info",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted text-muted-foreground",
  brand: "border-primary/25 bg-primary/10 text-primary",
};

export function Chip({
  tone = "muted",
  icon,
  testId,
  className = "",
  children,
}: {
  tone?: ChipTone;
  icon?: ReactNode;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CHIP_TONES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}

/** Delta chip: arrow plus a short figure. `good` picks green or red; a flat delta stays grey. */
export function DeltaChip({ direction, good, children }: { direction: "up" | "down" | "flat"; good: boolean; children: ReactNode }) {
  const tone =
    direction === "flat" ? "bg-muted text-muted-foreground" : good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive";
  const arrow = direction === "up" ? "M7 17 17 7M8 7h9v9" : direction === "down" ? "M7 7l10 10M17 8v9H8" : "M5 12h14";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={arrow} />
      </svg>
      {children}
    </span>
  );
}

/** KPI tile: label, big figure, optional icon and a footer line (hint, delta chip or both). */
export function StatTile({
  label,
  value,
  icon,
  hint,
  testId,
  tone,
  children,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  hint?: ReactNode;
  testId?: string;
  tone?: "default" | "danger" | "success";
  children?: ReactNode;
}) {
  const iconTone =
    tone === "danger" ? "bg-destructive/10 text-destructive" : tone === "success" ? "bg-success/10 text-success" : "bg-primary/10 text-primary";
  return (
    <div data-testid={testId} className="surface min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon && <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconTone}`}>{icon}</span>}
      </div>
      <p className="mt-2 truncate text-[1.7rem] font-semibold leading-none tracking-tight tabular-nums text-foreground">{value}</p>
      {(children || hint) && <div className="mt-3 text-xs leading-snug text-muted-foreground">{children ?? hint}</div>}
    </div>
  );
}

/** Round tinted icon holder used at the start of panel headers. */
export function IconBadge({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "muted" | "success" | "danger" }) {
  const tones = {
    brand: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
    success: "bg-success/10 text-success",
    danger: "bg-destructive/10 text-destructive",
  } as const;
  return (
    <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{children}</span>
  );
}
