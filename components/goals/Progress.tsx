export type ProgressTone = "primary" | "success" | "warn" | "danger";

const FILL: Record<ProgressTone, string> = {
  primary: "bg-primary",
  success: "bg-green-600",
  warn: "bg-amber-500",
  danger: "bg-destructive",
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
      className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={`h-full rounded-full transition-all ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
