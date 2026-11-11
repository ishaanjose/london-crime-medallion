"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";
import { formatMonth } from "@/lib/format";
import { chart } from "@/lib/theme";

type ReconRow = {
  month: string;
  crime_group: string;
  police_uk: number;
  met: number;
};

type GapRow = { start_month: string };

type ChartPoint = {
  month: string;
  police_uk: number;
  met: number;
  pct_diff: number | null;
};

function fmtCount(n: number): string {
  return n.toLocaleString("en-GB");
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-7 w-48 rounded bg-[var(--skeleton)]" />
      <div className="h-[220px] rounded bg-[var(--skeleton)]" />
      <div className="h-[100px] rounded bg-[var(--skeleton)]" />
    </div>
  );
}

export default function Reconciliation() {
  const [selectedGroup, setSelectedGroup] = useState<string>("All groups");

  const { data, error, loading } = useQuery<ReconRow>((index) => {
    const R = parquet(index, "rpt_crime_reconciliation");
    return `
      select
        strftime(month, '%Y-%m') as month,
        crime_group,
        sum(police_uk_count)::double as police_uk,
        sum(met_count)::double as met
      from ${R}
      group by all
      order by month
    `;
  });

  const { data: gapData } = useQuery<GapRow>((index) => {
    const KI = parquet(index, "rpt_known_issues");
    return `
      select strftime(start_month, '%Y-%m') as start_month
      from ${KI}
      where issue_type = 'coverage gap'
      order by start_month
    `;
  });

  const crimeGroups = useMemo(() => {
    if (!data) return ["All groups"];
    return [
      "All groups",
      ...Array.from(new Set(data.map((r) => r.crime_group))).sort(),
    ];
  }, [data]);

  const chartData = useMemo<ChartPoint[]>(() => {
    if (!data) return [];
    if (selectedGroup === "All groups") {
      const byMonth = new Map<string, { police_uk: number; met: number }>();
      for (const row of data) {
        const e = byMonth.get(row.month) ?? { police_uk: 0, met: 0 };
        byMonth.set(row.month, {
          police_uk: e.police_uk + row.police_uk,
          met: e.met + row.met,
        });
      }
      return Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { police_uk, met }]) => ({
          month,
          police_uk,
          met,
          pct_diff: met > 0 ? ((police_uk - met) / met) * 100 : null,
        }));
    }
    return data
      .filter((r) => r.crime_group === selectedGroup)
      .map((r) => ({
        month: r.month,
        police_uk: r.police_uk,
        met: r.met,
        pct_diff: r.met > 0 ? ((r.police_uk - r.met) / r.met) * 100 : null,
      }));
  }, [data, selectedGroup]);

  const pctRange = useMemo(() => {
    const vals = chartData
      .map((p) => p.pct_diff)
      .filter((v): v is number => v !== null);
    if (!vals.length) return { domain: [-25, 25] as [number, number], ticks: [-25, 0, 25] };
    const domMax = Math.ceil(Math.max(...vals) / 25) * 25;
    const domMin = Math.floor(Math.min(...vals) / 25) * 25;
    const range = domMax - domMin;
    const step = range / 25 + 1 > 6 ? 50 : 25;
    // Anchor ticks on 0 so it is always on the step grid and never lands
    // 25 points from a neighbour (they'd overlap with interval={0}).
    const ticks: number[] = [];
    for (let v = Math.ceil(Math.min(domMin, 0) / step) * step; v <= Math.max(domMax, 0); v += step) {
      ticks.push(v);
    }
    return { domain: [domMin, domMax] as [number, number], ticks };
  }, [chartData]);

  const visibleGaps = useMemo(() => {
    if (!gapData || chartData.length === 0) return [];
    const first = chartData[0].month;
    const last = chartData[chartData.length - 1].month;
    return gapData.filter(
      (g) => g.start_month >= first && g.start_month <= last,
    );
  }, [gapData, chartData]);

  const tooltipStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    fontSize: "12px",
    color: "var(--fg)",
  };

  if (loading) return <Skeleton />;
  if (error) {
    return (
      <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
        {error}
      </pre>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--fg-muted)]">
        Each month, police.uk counts are compared to the Met&apos;s own published
        figures. A test fails the build if any crime group differs by more than
        50% without a registered coverage gap.
      </p>

      <div className="flex items-center gap-2">
        <label
          className="text-xs text-[var(--fg-muted)]"
          htmlFor="recon-group"
        >
          Crime group
        </label>
        <select
          id="recon-group"
          value={selectedGroup}
          onChange={(e) => setSelectedGroup(e.target.value)}
          className="text-sm rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] px-2 py-1"
        >
          {crimeGroups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div role="img" aria-label={`police.uk vs Met counts for ${selectedGroup}`}>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
          >
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
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "var(--fg)", marginBottom: 4 }}
              itemStyle={{ color: "var(--fg)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) =>
                typeof v === "number" ? [fmtCount(Math.round(v))] : [v]
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
                  value: "gap",
                  position: "insideTopRight",
                  style: { fontSize: 10, fill: "var(--fg-muted)" },
                }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="police_uk"
              name="police.uk"
              stroke={chart.crimes}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="met"
              name="Met datastore"
              stroke={chart.avg12m}
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 3"
              activeDot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div role="img" aria-label="% difference: police.uk vs Met">
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart
            data={chartData}
            margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
          >
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
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={72}
              domain={pctRange.domain}
              ticks={pctRange.ticks}
              interval={0}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "var(--fg)", marginBottom: 4 }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) =>
                typeof v === "number"
                  ? [`${v.toFixed(1)}%`, "% diff (police.uk vs Met)"]
                  : [v]
              }
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(lbl: any) =>
                typeof lbl === "string" ? formatMonth(lbl) : lbl
              }
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <ReferenceArea
              y1={-5}
              y2={5}
              fill="var(--chart-fill)"
              fillOpacity={0.5}
              stroke="none"
            />
            <ReferenceLine
              y={5}
              stroke="var(--chart-axis)"
              strokeDasharray="3 3"
              label={{
                value: "±5%",
                position: "insideTopRight",
                style: { fontSize: 10, fill: "var(--chart-axis)" },
              }}
            />
            <ReferenceLine
              y={-5}
              stroke="var(--chart-axis)"
              strokeDasharray="3 3"
            />
            {visibleGaps.map((g) => (
              <ReferenceLine
                key={g.start_month}
                x={g.start_month}
                stroke="var(--fg-muted)"
                strokeDasharray="4 2"
              />
            ))}
            <Bar
              dataKey="pct_diff"
              name="% diff"
              fill={chart.crimes}
              fillOpacity={0.6}
              radius={[2, 2, 0, 0]}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
