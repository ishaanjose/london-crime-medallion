"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";
import { chart } from "@/lib/theme";
import { formatMonth } from "@/lib/format";

type TrendRow = { month: string; crimes: number; avg_12m: number };
type GapRow = { start_month: string };

type Range = "3y" | "5y" | "All";
const RANGES: { label: Range; months: number }[] = [
  { label: "3y", months: 36 },
  { label: "5y", months: 60 },
  { label: "All", months: Infinity },
];

function fmtCount(n: number): string {
  return n.toLocaleString("en-GB");
}

function Skeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <div className="flex gap-2 mb-3">
        {["3y", "5y", "All"].map((l) => (
          <div key={l} className="h-7 w-9 rounded bg-[var(--skeleton)]" />
        ))}
      </div>
      <div className="h-[260px] rounded bg-[var(--skeleton)]" />
    </div>
  );
}

export default function TrendChart() {
  const [range, setRange] = useState<Range>("5y");

  const { data, error, loading } = useQuery<TrendRow>((index) => {
    const L = parquet(index, "fct_police_uk_london_month");
    return `
      select
        month::varchar as month,
        crime_count::double  as crimes,
        crime_count_12m / 12.0 as avg_12m
      from ${L}
      order by month
    `;
  });

  const { data: gapData } = useQuery<GapRow>((index) => {
    const KI = parquet(index, "rpt_known_issues");
    return `
      select start_month::varchar as start_month
      from ${KI}
      where issue_type = 'coverage gap'
      order by start_month
    `;
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const r = RANGES.find((x) => x.label === range)!;
    return r.months === Infinity
      ? data
      : data.slice(Math.max(0, data.length - r.months));
  }, [data, range]);

  const visibleGaps = useMemo(() => {
    if (!gapData || filtered.length === 0) return [];
    const first = filtered[0].month;
    const last = filtered[filtered.length - 1].month;
    return gapData.filter((g) => g.start_month >= first && g.start_month <= last);
  }, [gapData, filtered]);

  const ariaLabel =
    filtered.length > 0
      ? `Monthly London crime from ${formatMonth(filtered[0].month)} to ${formatMonth(filtered[filtered.length - 1].month)}`
      : "Monthly London crime trend";

  if (loading) return <Skeleton />;
  if (error)
    return (
      <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
        {error}
      </pre>
    );

  const tooltipStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    fontSize: "12px",
    color: "var(--fg)",
  };

  return (
    <div>
      <div className="flex gap-2 mb-3" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.label}
            aria-pressed={range === r.label}
            onClick={() => setRange(r.label)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              range === r.label
                ? "border-[var(--chart-1)] text-[var(--chart-1)] font-semibold bg-[var(--chart-fill)]"
                : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--chart-1)] hover:text-[var(--chart-1)]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart
            data={filtered}
            margin={{ top: 4, right: 8, bottom: 0, left: 4 }}
          >
            <defs>
              <linearGradient id="crimesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  style={{ stopColor: "var(--chart-1)", stopOpacity: 0.15 }}
                />
                <stop
                  offset="100%"
                  style={{ stopColor: "var(--chart-1)", stopOpacity: 0 }}
                />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 0"
              stroke={chart.grid}
              vertical={false}
            />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={56}
            />
            <YAxis
              tickFormatter={fmtCount}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={72}
              label={{
                value: "crimes",
                angle: -90,
                position: "insideLeft",
                offset: 14,
                style: { fontSize: 10, fill: "var(--chart-axis)" },
              }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "var(--fg)", marginBottom: 4 }}
              itemStyle={{ color: "var(--fg)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) =>
                typeof v === "number" ? [fmtCount(v)] : [v]
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(lbl: any) =>
                typeof lbl === "string" ? formatMonth(lbl) : lbl
              }
            />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="line"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => (
                <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                  {value}
                </span>
              )}
            />

            {visibleGaps.map((g) => (
              <ReferenceLine
                key={g.start_month}
                x={g.start_month}
                stroke="var(--fg-muted)"
                strokeDasharray="4 2"
                label={{
                  value: "police.uk gap",
                  position: "insideTopRight",
                  style: { fontSize: 10, fill: "var(--fg-muted)" },
                }}
              />
            ))}

            <Area
              type="monotone"
              dataKey="crimes"
              name="Monthly crimes"
              stroke={chart.crimes}
              strokeWidth={1.5}
              fill="url(#crimesGradient)"
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="avg_12m"
              name="12-month avg"
              stroke={chart.avg12m}
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 3"
              activeDot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
