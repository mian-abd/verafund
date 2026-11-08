"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { formatCents } from "@/lib/format";
import { categoryColor, categoryLabel } from "./categories";

export type DonutSlice = { category: string; cents: number };

export function CategoryDonut({ slices }: { slices: DonutSlice[] }) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.cents, 0);
  const data = slices.map((s) => ({ name: categoryLabel(s.category), value: s.cents, color: categoryColor(s.category) }));
  const share = (cents: number) => (total > 0 ? Math.round((cents / total) * 100) : 0);
  const focus = active !== null ? data[active] : null;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row lg:flex-col">
      <div
        role="img"
        aria-label={`Spending by category this month, total ${formatCents(total)}`}
        className="relative h-48 w-48 flex-shrink-0"
      >
        <ClientOnly>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 192, height: 192 }}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="70%"
                outerRadius="100%"
                paddingAngle={3}
                cornerRadius={6}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive={false}
                onMouseEnter={(_, i) => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {data.map((d, i) => (
                  <Cell key={d.name} fill={d.color} fillOpacity={active === null || active === i ? 1 : 0.28} style={{ outline: "none", transition: "fill-opacity .15s" }} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ClientOnly>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
          <span className="max-w-full truncate text-[11px] font-medium text-muted-foreground">{focus ? focus.name : "Spent"}</span>
          <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatCents(focus ? focus.value : total)}
          </span>
          {focus && <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{share(focus.value)}% of spending</span>}
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-0.5 text-sm" onMouseLeave={() => setActive(null)}>
        {slices.map((s, i) => (
          <li
            key={s.category}
            onMouseEnter={() => setActive(i)}
            className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors ${active === i ? "bg-muted" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-[4px]"
                style={{ background: categoryColor(s.category) }}
                aria-hidden="true"
              />
              <span className="truncate text-foreground">{categoryLabel(s.category)}</span>
            </span>
            <span className="flex flex-shrink-0 items-baseline gap-2 tabular-nums">
              <span className="font-medium text-foreground">{formatCents(s.cents)}</span>
              <span className="w-9 text-right text-xs text-muted-foreground">{share(s.cents)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
