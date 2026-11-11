"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@/lib/useQuery";
import { formatMonth } from "@/lib/format";
import { chart, outcome } from "@/lib/theme";
import {
  buildOutcomeMixSql, fmtPct, OUTCOME_GROUPS, type MixRow, type OutcomeGroup, type Scope,
} from "@/lib/outcomes";

type MixBar = { label: string; total: number } & Partial<Record<OutcomeGroup, number>>;

const ROW_HEIGHT = 30;

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-4 w-64 max-w-full rounded bg-[var(--skeleton)]" />
      <div className="h-[260px] rounded bg-[var(--skeleton)]" />
      <div className="h-4 w-full rounded bg-[var(--skeleton)]" />
    </div>
  );
}

function buildBars(rows: MixRow[]): { bars: MixBar[]; latestLabel: string | null } {
  const byPeriod = new Map<string, MixBar>();
  let latestLabel: string | null = null;
  for (const r of rows) {
    let label = r.period;
    if (r.period === "latest") {
      label = `${formatMonth(r.window_from)} to ${formatMonth(r.window_to)}`;
      latestLabel = label;
    }
    const bar = byPeriod.get(r.period) ?? { label, total: 0 };
    bar[r.final_outcome_group] = (bar[r.final_outcome_group] ?? 0) + r.crimes;
    bar.total += r.crimes;
    byPeriod.set(r.period, bar);
  }
  const latest = byPeriod.get("latest");
  const years = [...byPeriod.entries()]
    .filter(([k]) => k !== "latest")
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([, v]) => v);
  return { bars: latest ? [latest, ...years] : years, latestLabel };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MixTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload as MixBar;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs shadow-md">
      <p className="font-medium text-[var(--fg)]">
        {b.label} · {b.total.toLocaleString("en-GB")} crimes
      </p>
      <table className="mt-1 tabular-nums">
        <tbody>
          {OUTCOME_GROUPS.map((g) => (
            <tr key={g}>
              <td className="pr-2">
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
                  style={{ background: outcome[g] }}
                />
                <span className="text-[var(--fg-muted)]">{g}</span>
              </td>
              <td className="text-right text-[var(--fg)]">
                {b.total > 0 ? fmtPct((b[g] ?? 0) / b.total) : "n/a"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OutcomeMix({ scope, label }: { scope: Scope; label: string }) {
  const { data, error, loading } = useQuery<MixRow>((index) => buildOutcomeMixSql(index, scope));
  const { bars, latestLabel } = useMemo(() => buildBars(data ?? []), [data]);

  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  if (bars.length === 0) throw new Error("No usable months for this selection.");

  const title = `${label}: final police outcome, share of crimes`;
  const latest = latestLabel ? bars[0] : null;

  return (
    <figure className="space-y-2">
      <p className="text-xs text-[var(--fg-muted)]">{title}</p>
      <div role="img" aria-label={`${title}, by period, latest first`}>
        <ResponsiveContainer width="100%" height={bars.length * ROW_HEIGHT + 32}>
          <BarChart
            data={bars}
            layout="vertical"
            stackOffset="expand"
            margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
            barCategoryGap={4}
          >
            <CartesianGrid strokeDasharray="3 0" stroke={chart.grid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickFormatter={(v: number) => fmtPct(v, 0)}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tickFormatter={(v: string) => (v === latestLabel ? "Latest 12m" : v)}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<MixTooltip />} cursor={{ fill: "var(--chart-fill)", fillOpacity: 0.5 }} />
            {OUTCOME_GROUPS.map((g) => (
              <Bar key={g} dataKey={g} stackId="mix" fill={outcome[g]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--fg-muted)]" aria-label="Legend">
        {OUTCOME_GROUPS.map((g) => (
          <li key={g} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: outcome[g] }} />
            {g}
            {latest && latest.total > 0 && (
              <span className="tabular-nums text-[var(--fg)]">{fmtPct((latest[g] ?? 0) / latest.total)}</span>
            )}
          </li>
        ))}
      </ul>
      <figcaption className="space-y-1 text-xs text-[var(--fg-muted)]">
        <p>
          Each crime is counted once, under its latest police outcome.
          {latestLabel && ` Percentages in the legend are for ${latestLabel}.`} Other bars are
          calendar years in which every month is mature and unimpaired.
        </p>
        <p>
          The Charged share here is not the charge rate above: it counts a charge at any time,
          and a crime charged and later given another outcome counts under the later one.
        </p>
      </figcaption>
    </figure>
  );
}
