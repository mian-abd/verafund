// Recharts styling driven by the app theme variables so charts follow light/dark mode.

export const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 12 } as const;
export const GRID_STROKE = "var(--color-border)";
export const INCOME_COLOR = "#16A34A";
export const SPEND_COLOR = "var(--color-primary)";

export const TOOLTIP_STYLE = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  color: "var(--color-popover-foreground)",
  fontSize: 13,
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
} as const;

/** Compact dollars for axis ticks: $1.2k, $850. */
export function compactDollars(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(abs)}`;
}
