"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { formatCents } from "@/lib/format";
import { ChartTooltip } from "./ChartTooltip";
import { AXIS_TICK, GRID_DASH, GRID_STROKE, compactDollars } from "./chartTheme";

export type CashFlowDatum = { day: number; label: string; balanceCents: number };

export function CashFlowChart({ data }: { data: CashFlowDatum[] }) {
  const first = data[0];
  const last = data[data.length - 1];
  const balances = data.map((d) => d.balanceCents);
  const lo = balances.length ? Math.min(...balances) : 0;
  const hi = balances.length ? Math.max(...balances) : 0;
  const pad = Math.max((hi - lo) * 0.14, 5000);
  const lowest = data.reduce<CashFlowDatum | null>((m, d) => (m === null || d.balanceCents < m.balanceCents ? d : m), null);
  const showLow = lowest !== null && lowest !== first && lowest !== last && data.length > 4;

  return (
    <div
      role="img"
      aria-label={`Estimated balance over the next 30 days, from ${formatCents(first?.balanceCents ?? 0)} today to ${formatCents(last?.balanceCents ?? 0)}`}
      className="h-60 w-full"
    >
      <ClientOnly>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 240 }}>
          <AreaChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cashflow-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                <stop offset="70%" stopColor="var(--color-primary)" stopOpacity={0.06} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray={GRID_DASH} />
            <XAxis
              dataKey="label"
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              interval="preserveStartEnd"
              minTickGap={48}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={48}
              tickCount={5}
              tickFormatter={compactDollars}
              domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]}
            />
            {lo < 0 && <ReferenceLine y={0} stroke="var(--color-destructive)" strokeDasharray="4 4" strokeOpacity={0.8} />}
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: "var(--color-muted-foreground)", strokeOpacity: 0.45, strokeDasharray: "3 4" }}
              content={
                <ChartTooltip
                  build={(label, payload) => {
                    const row = payload[0]?.payload as CashFlowDatum | undefined;
                    if (!row || !first) return null;
                    const change = row.balanceCents - first.balanceCents;
                    return {
                      title: label,
                      rows: [{ label: "Projected balance", value: formatCents(row.balanceCents), color: "var(--color-primary)" }],
                      footer:
                        row.day === 0
                          ? undefined
                          : {
                              label: "Change since today",
                              value: `${change >= 0 ? "+" : "−"}${formatCents(Math.abs(change))}`,
                              tone: change >= 0 ? "good" : "bad",
                            },
                    };
                  }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="balanceCents"
              stroke="var(--color-primary)"
              strokeWidth={2.25}
              fill="url(#cashflow-fill)"
              isAnimationActive={false}
              activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--color-card)", fill: "var(--color-primary)" }}
            />
            {showLow && lowest && (
              <ReferenceDot
                x={lowest.label}
                y={lowest.balanceCents}
                r={4}
                fill="var(--color-card)"
                stroke={lowest.balanceCents < 0 ? "var(--color-destructive)" : "var(--color-primary)"}
                strokeWidth={2}
                label={{
                  value: `Low ${compactDollars(lowest.balanceCents)}`,
                  position: "bottom",
                  fill: "var(--color-muted-foreground)",
                  fontSize: 11,
                  fontWeight: 600,
                  offset: 8,
                }}
              />
            )}
            {last && (
              <ReferenceDot x={last.label} y={last.balanceCents} r={4} fill="var(--color-primary)" stroke="var(--color-card)" strokeWidth={2} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </ClientOnly>
    </div>
  );
}
