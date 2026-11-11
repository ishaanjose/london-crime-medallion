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
  ResponsiveContainer,
} from "recharts";
import { chart } from "@/lib/theme";
import { LEVELS, type Level, type SummaryRow } from "@/lib/concentration";

type Point = { year: number; lsoa: number | null; point: number | null };

const HEIGHT = 260;
const LOCKDOWN_YEAR = 2020;
const LOCKDOWN_NOTE = "Lockdown year: crime fell and was spread more evenly.";
const ORDER: Level[] = ["lsoa", "point"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function YearTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Point;
  return (
    <div className="max-w-xs rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs shadow-md">
      <p className="font-medium text-[var(--fg)]">{p.year}</p>
      {ORDER.map((level) => (
        <p key={level} className="mt-1 tabular-nums text-[var(--fg)]">
          {LEVELS[level].label}:{" "}
          {p[level] != null ? (
            `${p[level]}% for half of crime`
          ) : (
            <span className="italic text-[var(--fg-muted)]">not comparable this year</span>
          )}
        </p>
      ))}
      {p.year === LOCKDOWN_YEAR && <p className="mt-1 text-[var(--fg-muted)]">{LOCKDOWN_NOTE}</p>}
    </div>
  );
}

export default function ConcentrationTrend({ rows }: { rows: SummaryRow[] }) {
  const points = useMemo<Point[]>(() => {
    const byYear = new Map<number, Point>();
    for (const r of rows) {
      const p = byYear.get(r.year) ?? { year: r.year, lsoa: null, point: null };
      p[r.place_level] = r.pct_places_for_half_of_crime;
      byYear.set(r.year, p);
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [rows]);

  if (points.length === 0) throw new Error("No concentration summary rows.");

  const top = Math.max(0, ...points.flatMap((p) => [p.lsoa ?? 0, p.point ?? 0]));
  const yMax = Math.ceil(top / 5) * 5 || 5;
  const yTicks = Array.from({ length: yMax / 5 + 1 }, (_, i) => i * 5);
  const gaps = points.filter((p) => p.point == null).map((p) => p.year);
  const first = points[0].year;
  const last = points[points.length - 1].year;
  const hasLockdown = points.some((p) => p.year === LOCKDOWN_YEAR);
  const title = "Share of places needed for half of recorded crime, by year";
  const describe = (level: Level) => {
    const vals = points.filter((p) => p[level] != null);
    if (vals.length === 0) return "";
    const a = vals[0];
    const b = vals[vals.length - 1];
    return `${LEVELS[level].plural} ${a[level]}% in ${a.year}, ${b[level]}% in ${b.year}`;
  };

  return (
    <figure className="space-y-2">
      <p className="text-xs text-[var(--fg-muted)]">{title}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--fg)]" aria-hidden="true">
        {ORDER.map((level) => (
          <li key={level} className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ background: LEVELS[level].color }}
            />
            {LEVELS[level].label}
          </li>
        ))}
      </ul>
      <div
        role="img"
        aria-label={`${title}, ${first} to ${last}. ${describe("lsoa")}; ${describe("point")}.${
          gaps.length ? ` No street point values for ${gaps.join(" and ")}.` : ""
        }${hasLockdown ? ` ${LOCKDOWN_YEAR}: ${LOCKDOWN_NOTE}` : ""}`}
      >
        <ResponsiveContainer width="100%" height={HEIGHT}>
          <LineChart data={points} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 0" stroke={chart.grid} vertical={false} />
            {hasLockdown && (
              <ReferenceLine
                x={LOCKDOWN_YEAR}
                stroke="var(--fg-muted)"
                strokeDasharray="3 3"
                label={{
                  value: "Lockdown",
                  position: "top",
                  style: { fontSize: 10, fill: "var(--fg-muted)" },
                }}
              />
            )}
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<YearTooltip />} cursor={{ stroke: "var(--border)" }} />
            {ORDER.map((level) => (
              <Line
                key={level}
                type="linear"
                dataKey={level}
                name={LEVELS[level].label}
                stroke={LEVELS[level].color}
                strokeWidth={1.75}
                dot={{ r: 2.5, fill: LEVELS[level].color, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="space-y-1 text-xs text-[var(--fg-muted)]">
        <p>Lower means more concentrated: fewer places hold half of all crime.</p>
        {hasLockdown && <p>{LOCKDOWN_YEAR}: {LOCKDOWN_NOTE}</p>}
        {gaps.length > 0 && (
          <p>
            Street points have no value for {gaps.join(" and ")}: police.uk replaced its map-point
            set in those years, so the line breaks there.
          </p>
        )}
      </figcaption>
    </figure>
  );
}
