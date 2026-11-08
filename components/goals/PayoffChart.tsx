"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientOnly } from "@/components/ClientOnly";
import { ChartTooltip } from "@/components/overview/ChartTooltip";
import { AXIS_TICK, GRID_DASH, GRID_STROKE, compactDollars } from "@/components/overview/chartTheme";
import { formatCents } from "@/lib/format";

type Row = { month: number; avalanche: number; snowball: number };

const AVALANCHE = "var(--color-primary)";
const SNOWBALL = "var(--color-info)";

export function PayoffChart({ rows }: { rows: Row[] }) {
  const last = rows[rows.length - 1];
  return (
    <div
      role="img"
      aria-label={`Line chart of total debt balance by month. Starts at ${formatCents(rows[0]?.avalanche ?? 0)} and reaches zero around month ${last?.month ?? 0}.`}
      className="h-64 w-full"
    >
      <ClientOnly>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray={GRID_DASH} vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
              tickMargin={10}
              tickFormatter={(m) => `${m}`}
              label={{ value: "Months from now", position: "insideBottom", offset: -6, fill: "var(--color-muted-foreground)", fontSize: 11 }}
              height={42}
              minTickGap={28}
            />
            <YAxis tickFormatter={compactDollars} tickLine={false} axisLine={false} width={48} tick={AXIS_TICK} tickCount={5} />
            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: "var(--color-muted-foreground)", strokeOpacity: 0.45, strokeDasharray: "3 4" }}
              content={
                <ChartTooltip
                  build={(label, payload) => {
                    const row = payload[0]?.payload as Row | undefined;
                    if (!row) return null;
                    return {
                      title: `Month ${label}`,
                      rows: [
                        { label: "Avalanche", value: formatCents(row.avalanche), color: AVALANCHE },
                        { label: "Snowball", value: formatCents(row.snowball), color: SNOWBALL },
                      ],
                    };
                  }}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="avalanche"
              name="Avalanche"
              stroke={AVALANCHE}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 3, stroke: "var(--color-card)", fill: AVALANCHE }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="snowball"
              name="Snowball"
              stroke={SNOWBALL}
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 3, stroke: "var(--color-card)", fill: SNOWBALL }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ClientOnly>
    </div>
  );
}
