"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@/lib/useQuery";
import { formatMonth } from "@/lib/format";
import { chart } from "@/lib/theme";
import { buildAreaTrendSql, TREND_MONTHS, type AreaTrendRow } from "@/lib/area";
import SectionBoundary from "@/components/SectionBoundary";

type Props = { lsoa: string };

const HEIGHT = 260;

const fmt1 = (v: number) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-4 w-72 max-w-full rounded bg-[var(--skeleton)]" />
      <div className="rounded bg-[var(--skeleton)]" style={{ height: HEIGHT }} />
      <div className="h-4 w-full rounded bg-[var(--skeleton)]" />
    </div>
  );
}

const tooltipStyle = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  fontSize: "12px",
  color: "var(--fg)",
};

function Trend({ lsoa }: Props) {
  const { data, error, loading } = useQuery<AreaTrendRow>((index) =>
    buildAreaTrendSql(index, lsoa),
  );

  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  if (data.length === 0) throw new Error("No monthly data for this LSOA.");

  const first = formatMonth(data[0].month);
  const last = formatMonth(data[data.length - 1].month);
  const excluded = data[0].excluded_groups;
  const title = `Crimes per 1,000 residents each month, ${first} to ${last}`;

  return (
    <figure className="space-y-2">
      <p className="text-xs text-[var(--fg-muted)]">{title}</p>
      <div role="img" aria-label={`${title}: this LSOA against the median London LSOA`}>
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 0" stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v: number) => v.toLocaleString("en-GB")}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: "var(--fg)", marginBottom: 4 }}
              itemStyle={{ color: "var(--fg)" }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => (typeof v === "number" ? [fmt1(v)] : [v])}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(lbl: any) => (typeof lbl === "string" ? formatMonth(lbl) : lbl)}
            />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="line"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any) => (
                <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{value}</span>
              )}
            />
            <Line
              type="linear"
              dataKey="area_rate"
              name="This LSOA"
              stroke={chart.crimes}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="london_median"
              name="Median London LSOA"
              stroke={chart.avg12m}
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-[var(--fg-muted)]">
        Each month’s crimes over that month’s resident population. The median is taken
        across London LSOAs each month, leaving out low-population ones. Excludes
        anti-social behaviour
        {excluded ? ` and ${excluded} (police.uk coverage gap in the last ${TREND_MONTHS} months)` : ""}.
      </figcaption>
    </figure>
  );
}

export default function AreaTrend(props: Props) {
  return (
    <SectionBoundary>
      <Trend {...props} />
    </SectionBoundary>
  );
}
