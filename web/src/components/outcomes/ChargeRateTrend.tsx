"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@/lib/useQuery";
import { formatMonth } from "@/lib/format";
import { chart, impaired as impairedFill } from "@/lib/theme";
import { buildTrendSql, fmtPct, type Scope, type TrendRow } from "@/lib/outcomes";

type Point = {
  month: string;
  rate: number | null;
  crimes: number;
  impaired: boolean;
  reasons: string[];
};

type Run = { from: string; to: string; reasons: string[] };

const HEIGHT = 260;

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-4 w-64 max-w-full rounded bg-[var(--skeleton)]" />
      <div className="rounded bg-[var(--skeleton)]" style={{ height: HEIGHT }} />
      <div className="h-4 w-full rounded bg-[var(--skeleton)]" />
    </div>
  );
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

// Consecutive impaired months become one shaded band.
function impairedRuns(points: Point[]): Run[] {
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (const p of points) {
    if (p.impaired) {
      if (cur) {
        cur.to = p.month;
        for (const r of p.reasons) if (!cur.reasons.includes(r)) cur.reasons.push(r);
      } else {
        cur = { from: p.month, to: p.month, reasons: [...p.reasons] };
      }
    } else if (cur) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PointTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="max-w-xs rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs shadow-md">
      <p className="font-medium text-[var(--fg)]">Crimes in {formatMonth(p.month)}</p>
      {p.impaired ? (
        <>
          <p className="mt-1 italic text-[var(--fg-muted)]">Excluded: outcome data impaired</p>
          {p.reasons.map((r) => (
            <p key={r} className="mt-1 text-[var(--fg-muted)]">{r}</p>
          ))}
        </>
      ) : (
        <>
          <p className="mt-1 tabular-nums text-[var(--fg)]">
            {p.rate != null ? fmtPct(p.rate) : "n/a"} charged within 12 months
          </p>
          <p className="tabular-nums text-[var(--fg-muted)]">
            {p.crimes.toLocaleString("en-GB")} crimes
          </p>
        </>
      )}
    </div>
  );
}

export default function ChargeRateTrend({ scope, label }: { scope: Scope; label: string }) {
  const { data, error, loading } = useQuery<TrendRow>((index) => buildTrendSql(index, scope));

  const { points, runs, firstImmature } = useMemo(() => {
    const rows = data ?? [];
    const pts: Point[] = rows
      .filter((r) => r.mature)
      .map((r) => ({
        month: r.month,
        crimes: r.crimes,
        impaired: r.impaired,
        rate: !r.impaired && r.crimes > 0 ? r.charged / r.crimes : null,
        reasons: r.reasons ? r.reasons.split("\n") : [],
      }));
    return {
      points: pts,
      runs: impairedRuns(pts),
      firstImmature: rows.find((r) => !r.mature)?.month ?? null,
    };
  }, [data]);

  // Whole-percent ticks: 2-point steps up to 10%, 5-point steps above.
  const yTicks = useMemo(() => {
    const top = Math.max(0, ...points.map((p) => p.rate ?? 0)) * 100;
    const step = top <= 10 ? 2 : 5;
    const max = Math.max(step, Math.ceil(top / step) * step);
    return Array.from({ length: max / step + 1 }, (_, i) => (i * step) / 100);
  }, [points]);

  // Thrown so the surrounding SectionBoundary shows it.
  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  if (points.length === 0) throw new Error("No mature months for this selection.");

  const first = points[0].month;
  const last = points[points.length - 1].month;
  const title = `${label}: share of crimes charged within 12 months, by month of crime`;

  return (
    <figure className="space-y-2">
      <p className="text-xs text-[var(--fg-muted)]">{title}</p>
      <div
        role="img"
        aria-label={`${title}, ${formatMonth(first)} to ${formatMonth(last)}. Shaded months are excluded because outcome data is impaired.`}
      >
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 0" stroke={chart.grid} vertical={false} />
            {runs.map((r) => (
              <ReferenceArea
                key={r.from}
                x1={r.from}
                x2={r.to}
                fill={impairedFill}
                fillOpacity={1}
                stroke="none"
                ifOverflow="extendDomain"
                // Narrow bands are too thin for a label; the caption covers them.
                label={
                  monthsBetween(r.from, r.to) >= 12
                    ? {
                        value: "impaired",
                        position: "insideTop",
                        style: { fontSize: 10, fill: "var(--fg-muted)" },
                      }
                    : undefined
                }
              />
            ))}
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={56}
            />
            <YAxis
              domain={[0, yTicks[yTicks.length - 1]]}
              ticks={yTicks}
              tickFormatter={(v: number) => fmtPct(v, 0)}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<PointTooltip />} cursor={{ stroke: "var(--border)" }} />
            <Line
              type="linear"
              dataKey="rate"
              stroke={chart.crimes}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="space-y-1 text-xs text-[var(--fg-muted)]">
        {runs.map((r) => (
          <p key={r.from}>
            Shaded, {formatMonth(r.from)} to {formatMonth(r.to)}: outcome data impaired, so no
            rate is shown. {r.reasons.join(". ")}.
          </p>
        ))}
        {firstImmature && (
          <p>
            Crimes from {formatMonth(firstImmature)} onwards are not plotted: they have not yet
            had 12 months of outcome data, so their rate would read falsely low.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
