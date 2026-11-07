"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { formatCents } from "@/lib/format";

type Row = { month: number; avalanche: number; snowball: number };

const AVALANCHE = "#E53E0B";
const SNOWBALL = "#3B82F6";

function compactDollars(cents: number): string {
  const d = cents / 100;
  return d >= 1000 ? `$${(d / 1000).toFixed(d >= 10_000 ? 0 : 1)}k` : `$${Math.round(d)}`;
}

export function PayoffChart({ rows }: { rows: Row[] }) {
  const last = rows[rows.length - 1];
  return (
    <div
      role="img"
      aria-label={`Line chart of total debt balance by month. Starts at ${formatCents(rows[0]?.avalanche ?? 0)} and reaches zero around month ${last?.month ?? 0}.`}
      className="h-64 w-full"
    >
      <ClientOnly><ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
            label={{ value: "Months from now", position: "insideBottom", offset: -2, fill: "var(--color-muted-foreground)", fontSize: 12 }}
            height={36}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={compactDollars}
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [formatCents(value), name]}
            labelFormatter={(m) => `Month ${m}`}
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              color: "var(--color-foreground)",
              fontSize: 12,
            }}
          />
          <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="avalanche" name="Avalanche" stroke={AVALANCHE} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="snowball"
            name="Snowball"
            stroke={SNOWBALL}
            strokeWidth={2.5}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer></ClientOnly>
    </div>
  );
}
