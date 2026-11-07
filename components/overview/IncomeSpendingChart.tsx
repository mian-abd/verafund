"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { formatCents } from "@/lib/format";
import type { MonthPoint } from "@/lib/insights";
import { AXIS_TICK, GRID_STROKE, INCOME_COLOR, SPEND_COLOR, TOOLTIP_STYLE, compactDollars } from "./chartTheme";

export function IncomeSpendingChart({ data }: { data: MonthPoint[] }) {
  const rows = data.map((m) => ({
    label: m.partial ? `${m.label}*` : m.label,
    Income: m.incomeCents,
    Spending: m.spendingCents,
  }));
  const summary = data
    .map((m) => `${m.label}: income ${formatCents(m.incomeCents)}, spending ${formatCents(m.spendingCents)}`)
    .join("; ");

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: INCOME_COLOR }} />
          Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SPEND_COLOR }} />
          Spending
        </span>
      </div>
      <div role="img" aria-label={`Income versus spending by month. ${summary}`} className="h-64 w-full">
        <ClientOnly><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 256 }}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={48} tickFormatter={compactDollars} />
            <Tooltip
              cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => formatCents(Number(value))}
            />
            <Bar dataKey="Income" fill={INCOME_COLOR} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            <Bar dataKey="Spending" fill={SPEND_COLOR} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer></ClientOnly>
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
