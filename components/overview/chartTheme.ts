// Recharts styling driven by the app theme variables so charts follow light/dark mode.

export const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 11, fontWeight: 500 } as const;
export const GRID_STROKE = "var(--grid-line)";
export const GRID_DASH = "2 6";

// Income is green and spending is the brand orange, in both themes.
export const INCOME_COLOR = "var(--color-income)";
export const SPEND_COLOR = "var(--color-spend)";

/** Compact dollars for axis ticks: $1.2k, $850. */
export function compactDollars(cents: number): string {
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  const sign = dollars < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(abs)}`;
}

/** Round axis ticks from zero (e.g. $0, $1k, $2k, $3k, $4k) so bar charts read cleanly. Values are cents. */
export function niceTicks(maxCents: number, intervals = 4): number[] {
  const max = Math.max(maxCents / 100, 1);
  const rough = max / intervals;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const n = Math.ceil(max / step);
  return Array.from({ length: n + 1 }, (_, i) => Math.round(i * step * 100));
}
