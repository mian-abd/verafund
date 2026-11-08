export type ProgressTone = "primary" | "success" | "warn" | "danger";

const FILL: Record<ProgressTone, string> = {
  primary: "bg-gradient-to-r from-primary/80 to-primary",
  success: "bg-gradient-to-r from-income/75 to-income",
  warn: "bg-gradient-to-r from-warning/70 to-warning",
  danger: "bg-gradient-to-r from-destructive/80 to-destructive",
};

export function ProgressBar({
  percent,
  label,
  tone = "primary",
  testId,
}: {
  percent: number;
  label: string;
  tone?: ProgressTone;
  testId?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      data-testid={testId}
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted shadow-[inset_0_1px_1px_rgba(0,0,0,0.06)]"
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
