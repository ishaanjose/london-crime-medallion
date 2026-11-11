"use client";

import { useQuery } from "@/lib/useQuery";
import { formatMonth } from "@/lib/format";
import { chart } from "@/lib/theme";
import { buildRankingSql, fmtPct, type RankingRow } from "@/lib/outcomes";

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="hidden sm:block w-44 h-4 shrink-0 rounded bg-[var(--skeleton)]" />
          <div className="flex-1 h-5 rounded bg-[var(--skeleton)]" />
          <div className="w-12 h-4 shrink-0 rounded bg-[var(--skeleton)]" />
        </div>
      ))}
    </div>
  );
}

type Props = {
  group: string | null;
  groupLabel: string;
  selectedBorough: string | null;
};

export default function BoroughRanking({ group, groupLabel, selectedBorough }: Props) {
  const { data, error, loading } = useQuery<RankingRow>((index) => buildRankingSql(index, group));

  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  if (data.length === 0) throw new Error("No crimes for this crime group in the window.");

  const { window_from, window_to, london_rate } = data[0];
  const max = Math.max(...data.map((r) => r.rate ?? 0), london_rate ?? 0);
  const pct = (v: number) => (max > 0 ? (v / max) * 100 : 0);
  const anyImpaired = data.some((r) => r.impaired_months > 0);
  const period = `${formatMonth(window_from)} to ${formatMonth(window_to)}`;

  return (
    <figure>
      <p className="mb-3 text-xs text-[var(--fg-muted)]">
        {groupLabel}: share charged within 12 months, crimes from {period}
      </p>
      <div
        role="img"
        aria-label={`Charge rate by borough for ${groupLabel.toLowerCase()}, crimes from ${period}, highest first`}
        className="space-y-3 sm:space-y-1.5"
      >
        {data.map((row) => {
          const selected = row.borough_code === selectedBorough;
          const flagged = row.impaired_months > 0;
          const labelClass = `text-xs truncate ${selected ? "font-semibold text-[var(--fg)]" : "text-[var(--fg-muted)]"}`;
          const name = (
            <>
              {row.borough_name}
              {flagged && (
                <span className="ml-1 italic">
                  ({row.impaired_months} impaired {row.impaired_months === 1 ? "month" : "months"})
                </span>
              )}
            </>
          );
          return (
            <div
              key={row.borough_code}
              title={`${row.borough_name}: ${row.charged.toLocaleString("en-GB")} of ${row.crimes.toLocaleString("en-GB")} crimes charged within 12 months`}
            >
              <div className={`sm:hidden mb-0.5 ${labelClass}`}>{name}</div>
              <div className="flex items-center gap-3">
                <div className={`hidden sm:block w-56 shrink-0 text-right ${labelClass}`}>{name}</div>
                <div className="relative h-5 flex-1">
                  <div
                    className="absolute inset-y-1 left-0 rounded-sm"
                    style={{
                      width: `${pct(row.rate ?? 0)}%`,
                      background: chart.bar,
                      opacity: selected ? 0.9 : flagged ? 0.2 : 0.4,
                      outline: flagged ? "1px dashed var(--fg-muted)" : undefined,
                    }}
                  />
                  {london_rate != null && (
                    <div
                      className="absolute inset-y-0 w-px bg-[var(--fg-muted)]"
                      style={{ left: `${pct(london_rate)}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div
                  className={`w-12 shrink-0 text-right text-xs tabular-nums ${selected ? "font-semibold text-[var(--fg)]" : "text-[var(--fg)]"}`}
                >
                  {row.rate != null ? fmtPct(row.rate) : "n/a"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-3 space-y-1 text-xs text-[var(--fg-muted)]">
        {london_rate != null && (
          <p>The vertical rule marks London as a whole: {fmtPct(london_rate)}.</p>
        )}
        <p>
          The window is the latest 12 months of crimes that have had a full 12 months of outcome
          data.{" "}
          {anyImpaired
            ? "Boroughs with an impaired month in the window are shown with a dashed outline and a lighter bar; their rate includes those months."
            : "No borough has an impaired month in this window."}
        </p>
        <p>Rates for small boroughs and small crime groups rest on few crimes and move a lot.</p>
      </figcaption>
    </figure>
  );
}
