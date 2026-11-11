"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@/lib/useQuery";
import { chart } from "@/lib/theme";
import { LEVELS, buildCurveSql, fmtPct0, type CurveRow, type Level } from "@/lib/concentration";

type Point = { x: number; y: number };

const HEIGHT = 300;
const TICKS = [0, 25, 50, 75, 100];

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-4 w-72 max-w-full rounded bg-[var(--skeleton)]" />
      <div className="rounded bg-[var(--skeleton)]" style={{ height: HEIGHT }} />
      <div className="h-4 w-full rounded bg-[var(--skeleton)]" />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CurveTooltip({ active, payload, plural }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  if (p.x === 0) return null;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs shadow-md">
      <p className="font-medium text-[var(--fg)]">Top {p.x}% of {plural}</p>
      <p className="mt-1 tabular-nums text-[var(--fg)]">{p.y.toFixed(1)}% of crime</p>
    </div>
  );
}

function Chart({ year, level }: { year: number; level: Level }) {
  const { data, error, loading } = useQuery<CurveRow>((index) => buildCurveSql(index, year, level));
  const { plural, color } = LEVELS[level];

  const points = useMemo<Point[]>(
    () => [{ x: 0, y: 0 }, ...(data ?? []).map((r) => ({ x: r.pct_places, y: r.pct_crime }))],
    [data],
  );

  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  if (data.length === 0) throw new Error(`No concentration curve for ${year} at ${plural}.`);

  const half = points.find((p) => p.y >= 50);
  const at = (x: number) => points.find((p) => p.x === x)?.y;
  const summaryParts = [1, 10, 25, 50]
    .map((x) => ({ x, y: at(x) }))
    .filter((p): p is Point => p.y != null)
    .map((p) => `the top ${p.x}% hold ${p.y.toFixed(0)}% of crime`);
  const title = `Cumulative share of crime, ${plural} ranked from most crime to least, ${year}`;
  const alt =
    `${title}. In ${summaryParts.join(", ")}.`.replace(". In the top", ". The top") +
    (half ? ` Half of crime is reached at ${half.x}% of ${plural}.` : "") +
    " An equal spread would follow the diagonal.";

  return (
    <figure className="space-y-2">
      <p className="text-xs text-[var(--fg-muted)]">{title}</p>
      <div role="img" aria-label={alt}>
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 0" stroke={chart.grid} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              ticks={TICKS}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              label={{
                value: `Share of ${plural}, most crime first`,
                position: "insideBottom",
                offset: -12,
                style: { fontSize: 11, fill: "var(--fg-muted)" },
              }}
            />
            <YAxis
              type="number"
              domain={[0, 100]}
              ticks={TICKS}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
              stroke="var(--fg-muted)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            {/* Invisible anchor so the label sits just below the diagonal */}
            <ReferenceDot
              x={70}
              y={70}
              r={0}
              fill="none"
              stroke="none"
              label={{
                value: "Equal spread",
                position: "right",
                offset: 6,
                style: { fontSize: 11, fill: "var(--fg-muted)" },
              }}
            />
            {half && (
              <>
                <ReferenceLine
                  segment={[{ x: 0, y: 50 }, { x: half.x, y: 50 }]}
                  stroke="var(--fg-muted)"
                  strokeDasharray="2 3"
                />
                <ReferenceLine
                  segment={[{ x: half.x, y: 0 }, { x: half.x, y: 50 }]}
                  stroke="var(--fg-muted)"
                  strokeDasharray="2 3"
                />
              </>
            )}
            <Tooltip content={<CurveTooltip plural={plural} />} cursor={{ stroke: "var(--border)" }} />
            <Line
              type="linear"
              dataKey="y"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            {half && (
              <ReferenceDot
                x={half.x}
                y={half.y}
                r={4}
                fill={color}
                stroke="var(--bg)"
                strokeWidth={1.5}
                label={{
                  value: `Half of crime: ${fmtPct0(half.x)} of ${plural}`,
                  position: "right",
                  offset: 8,
                  style: { fontSize: 11, fill: "var(--fg)" },
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-[var(--fg-muted)]">
        Places are ranked from most crime to least and added up in whole-percent steps. The
        further the curve bows above the dashed line, the more concentrated crime is. The share
        for half of crime is the first step that reaches 50%.
      </figcaption>
    </figure>
  );
}

export default function LorenzChart({ year, level }: { year: number; level: Level }) {
  // key: useQuery runs once per mount, so remount when the selection changes
  return <Chart key={`${year}-${level}`} year={year} level={level} />;
}
