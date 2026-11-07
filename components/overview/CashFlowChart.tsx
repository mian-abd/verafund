"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { formatCents } from "@/lib/format";
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, compactDollars } from "./chartTheme";

export type CashFlowDatum = { day: number; label: string; balanceCents: number };

export function CashFlowChart({ data }: { data: CashFlowDatum[] }) {
  const first = data[0];
  const last = data[data.length - 1];
  const min = data.length ? Math.min(...data.map((d) => d.balanceCents)) : 0;
  return (
    <div
      role="img"
      aria-label={`Estimated balance over the next 30 days, from ${formatCents(first?.balanceCents ?? 0)} today to ${formatCents(last?.balanceCents ?? 0)}`}
      className="h-56 w-full"
    >
      <ClientOnly><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 224 }}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cashflow-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={32} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} tickFormatter={compactDollars} domain={["auto", "auto"]} />
          {min < 0 && <ReferenceLine y={0} stroke="var(--color-destructive)" strokeDasharray="4 4" />}
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => [formatCents(Number(value)), "Estimated balance"]}
            labelFormatter={(label) => String(label)}
          />
          <Area
            type="monotone"
            dataKey="balanceCents"
            stroke="var(--color-primary)"
            strokeWidth={2}
            fill="url(#cashflow-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer></ClientOnly>
    </div>
  );
}
