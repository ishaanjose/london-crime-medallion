"use client";

import { useQuery } from "@/lib/useQuery";
import {
  FACTORS, buildBreakdownSql, strengthLabel, type Factor, type BreakdownRow,
} from "@/lib/place";
import SectionBoundary from "@/components/SectionBoundary";

type Props = {
  factor: Factor;
  period: string;
  latestMonth: string;
};

const fmt1 = (v: number) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-4 w-72 max-w-full rounded bg-[var(--skeleton)]" />
      <div className="h-40 rounded bg-[var(--skeleton)]" />
    </div>
  );
}

function Table({ factor, period, latestMonth }: Props) {
  const { data, error, loading } = useQuery<BreakdownRow>((index) =>
    buildBreakdownSql(index, factor, period, latestMonth),
  );

  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  if (data.length === 0) return null;

  const { firstBand, lastBand } = FACTORS[factor];

  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-[var(--fg-muted)]">
              <th className="py-1 pr-3 font-medium">Crime group</th>
              <th className="py-1 pr-3 font-medium text-right whitespace-nowrap">Near</th>
              <th className="py-1 pr-3 font-medium text-right whitespace-nowrap">Far</th>
              <th className="py-1 pr-3 font-medium text-right whitespace-nowrap">Near ÷ far</th>
              <th className="py-1 font-medium text-right whitespace-nowrap">Spearman ρ</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.crime_group} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-3 text-[var(--fg)]">{r.crime_group}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--fg)]">
                  {fmt1(r.nearest_median)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--fg)]">
                  {fmt1(r.furthest_median)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--fg)] font-medium">
                  {r.ratio != null ? `${fmt1(r.ratio)}×` : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--fg-muted)]">
                  {r.spearman != null
                    ? `${r.spearman.toFixed(2)} (${strengthLabel(r.spearman)})`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="text-xs text-[var(--fg-muted)]">
        Near: median rate per 1,000 {firstBand}. Far: {lastBand}.
        Excludes ASB and crime groups with a police.uk coverage gap in this period.
        The link with crime is correlation, not cause, and it mostly tracks how built-up an area is.
      </figcaption>
    </figure>
  );
}

export default function CrimeBreakdownChart({ factor, period, latestMonth }: Props) {
  return (
    <SectionBoundary>
      <Table
        key={`${factor}-${period}-${latestMonth}`}
        factor={factor}
        period={period}
        latestMonth={latestMonth}
      />
    </SectionBoundary>
  );
}
