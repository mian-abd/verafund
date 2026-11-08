"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { formatCents } from "@/lib/format";
import type { MonthPoint } from "@/lib/insights";
import { ChartTooltip } from "./ChartTooltip";
import { AXIS_TICK, GRID_DASH, GRID_STROKE, INCOME_COLOR, SPEND_COLOR, compactDollars, niceTicks } from "./chartTheme";

type Row = { label: string; partial: boolean; Income: number; Spending: number };

function Figure({ label, value, color, tone }: { label: string; value: string; color?: string; tone?: "good" | "bad" }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />}
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-lg font-semibold tabular-nums tracking-tight ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function IncomeSpendingChart({ data }: { data: MonthPoint[] }) {
  const rows: Row[] = data.map((m) => ({
    label: m.partial ? `${m.label}*` : m.label,
    partial: m.partial,
    Income: m.incomeCents,
    Spending: m.spendingCents,
  }));
  const income = data.reduce((s, m) => s + m.incomeCents, 0);
  const spending = data.reduce((s, m) => s + m.spendingCents, 0);
  const net = income - spending;
  const ticks = niceTicks(Math.max(0, ...data.flatMap((m) => [m.incomeCents, m.spendingCents])));
  const summary = data
    .map((m) => `${m.label}: income ${formatCents(m.incomeCents)}, spending ${formatCents(m.spendingCents)}`)
    .join("; ");

  return (
    <div>
      <div className="mb-5 grid grid-cols-3 gap-4 border-b border-border pb-4">
        <Figure label="Income" value={formatCents(income)} color={INCOME_COLOR} />
        <Figure label="Spending" value={formatCents(spending)} color={SPEND_COLOR} />
        <Figure label="Net" value={`${net >= 0 ? "+" : "−"}${formatCents(Math.abs(net))}`} tone={net >= 0 ? "good" : "bad"} />
      </div>
      <div role="img" aria-label={`Income versus spending by month. ${summary}`} className="h-60 w-full">
        <ClientOnly>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 240 }}>
            <BarChart data={rows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={4} barCategoryGap="26%">
              <defs>
                <linearGradient id="bar-income" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-income)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--color-income)" stopOpacity={0.62} />
                </linearGradient>
                <linearGradient id="bar-spend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-spend)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--color-spend)" stopOpacity={0.62} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray={GRID_DASH} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} tickMargin={10} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} tickFormatter={compactDollars} />
              <Tooltip
                cursor={{ fill: "var(--color-muted)", fillOpacity: 0.55, radius: 10 }}
                isAnimationActive={false}
                content={
                  <ChartTooltip
                    build={(label, payload) => {
                      const row = payload[0]?.payload as Row | undefined;
                      if (!row) return null;
                      const net = row.Income - row.Spending;
                      return {
                        title: label.replace("*", ""),
                        rows: [
                          { label: "Income", value: formatCents(row.Income), color: INCOME_COLOR },
                          { label: "Spending", value: formatCents(row.Spending), color: SPEND_COLOR },
                        ],
                        footer: {
                          label: net >= 0 ? "Saved" : "Overspent",
                          value: formatCents(Math.abs(net)),
                          tone: net >= 0 ? "good" : "bad",
                        },
                        note: row.partial ? "Partial month" : undefined,
                      };
                    }}
                  />
                }
              />
              <Bar dataKey="Income" fill="url(#bar-income)" radius={[7, 7, 2, 2]} maxBarSize={26} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.label} fillOpacity={r.partial ? 0.5 : 1} />
                ))}
              </Bar>
              <Bar dataKey="Spending" fill="url(#bar-spend)" radius={[7, 7, 2, 2]} maxBarSize={26} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.label} fillOpacity={r.partial ? 0.5 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ClientOnly>
      </div>
      <table className="sr-only">
        <caption>Income and spending by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Income</th>
            <th>Spending</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => (
            <tr key={m.key}>
              <td>
                {m.label}
                {m.partial ? " (partial month)" : ""}
              </td>
              <td>{formatCents(m.incomeCents)}</td>
              <td>{formatCents(m.spendingCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
