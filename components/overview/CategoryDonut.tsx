"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { formatCents } from "@/lib/format";
import { TOOLTIP_STYLE } from "./chartTheme";
import { categoryColor, categoryLabel } from "./categories";

export type DonutSlice = { category: string; cents: number };

export function CategoryDonut({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((s, x) => s + x.cents, 0);
  const data = slices.map((s) => ({ name: categoryLabel(s.category), value: s.cents, color: categoryColor(s.category) }));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div
        role="img"
        aria-label={`Spending by category this month, total ${formatCents(total)}`}
        className="relative h-44 w-44 flex-shrink-0"
      >
        <ClientOnly><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 176, height: 176 }}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="var(--color-card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => formatCents(Number(value))} />
          </PieChart>
        </ResponsiveContainer></ClientOnly>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Spent</span>
          <span className="text-lg font-bold tabular-nums text-foreground">{formatCents(total)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.category} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: categoryColor(s.category) }}
                aria-hidden="true"
              />
              <span className="truncate text-foreground">{categoryLabel(s.category)}</span>
            </span>
            <span className="flex-shrink-0 tabular-nums text-muted-foreground">
              {formatCents(s.cents)} <span className="text-xs">({total > 0 ? Math.round((s.cents / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
