"use client";

import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";
import { formatMonth } from "@/lib/format";

type CrimeGroupRow = {
  crime_group: string;
  last_12m: number;
  prior_12m: number;
  excluded: boolean;
  gap_description: string | null;
  gap_start: string | null;
};

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-44 h-4 shrink-0 rounded bg-[var(--skeleton)]" />
          <div className="flex-1 h-5 rounded bg-[var(--skeleton)]" />
          <div className="w-20 h-4 shrink-0 rounded bg-[var(--skeleton)]" />
          <div className="w-14 h-4 shrink-0 rounded bg-[var(--skeleton)]" />
        </div>
      ))}
    </div>
  );
}

export default function CrimeGroupBars() {
  const { data, error, loading } = useQuery<CrimeGroupRow>((index) => {
    const CBM = parquet(index, "fct_police_uk_crimes_borough_month");
    const KI = parquet(index, "rpt_known_issues");
    return `
      with b as (
        select
          month,
          coalesce(crime_group, 'Unmapped') as crime_group,
          sum(crime_count)::double as n
        from ${CBM}
        where crime_group is distinct from 'Anti-social behaviour'
        group by all
      ),
      mx as (select max(month) as m from b),
      excluded as (
        select distinct scope as crime_group, description, start_month::varchar as gap_start
        from ${KI}, mx
        where issue_type = 'coverage gap'
          and start_month <= m
          and coalesce(end_month, date '9999-12-01') > (m - interval 24 month)::date
      ),
      agg as (
        select
          b.crime_group,
          sum(n) filter (where month > m - interval 12 month) as last_12m,
          sum(n) filter (where month <= m - interval 12 month
                         and month > m - interval 24 month)   as prior_12m
        from b, mx
        group by b.crime_group
      )
      select
        a.crime_group,
        a.last_12m,
        a.prior_12m,
        (e.crime_group is not null) as excluded,
        e.description as gap_description,
        e.gap_start
      from agg a
      left join excluded e on e.crime_group = a.crime_group
      order by last_12m desc
    `;
  });

  if (loading) return <Skeleton />;
  if (error)
    return (
      <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
        {error}
      </pre>
    );
  if (!data) return null;

  const max = Math.max(...data.map((r) => r.last_12m));

  const colClass = "text-xs text-[var(--fg-muted)]";

  type GapNote = { crime_group: string; gap_start: string; gap_description: string };
  const gapNotes: GapNote[] = data
    .filter((r): r is typeof r & { gap_start: string; gap_description: string } =>
      r.excluded && r.gap_start != null && r.gap_description != null
    )
    .map((r) => ({ crime_group: r.crime_group, gap_start: r.gap_start, gap_description: r.gap_description }));

  return (
    <div>
      {/* Column headers — hidden on mobile, shown from sm up */}
      <div className="hidden sm:flex items-center gap-3 mb-1 pb-1 border-b border-[var(--border)]">
        <div className="w-44 shrink-0" />
        <div className="flex-1" />
        <div className={`w-20 shrink-0 text-right ${colClass}`}>Last 12m</div>
        <div className={`w-14 shrink-0 text-right ${colClass}`}>vs prior</div>
      </div>

      <div
        role="img"
        aria-label="Horizontal bars: crime counts by group over the last 12 months, sorted by volume"
        className="space-y-3 sm:space-y-1.5"
      >
        {data.map((row) => {
          const change =
            !row.excluded && row.prior_12m > 0
              ? (row.last_12m - row.prior_12m) / row.prior_12m
              : null;
          const changeText = row.excluded
            ? "coverage gap"
            : change !== null
              ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`
              : "—";
          const pct = max > 0 ? (row.last_12m / max) * 100 : 0;

          return (
            <div key={row.crime_group}>
              {/* Mobile: label on its own line */}
              <div className="sm:hidden text-xs text-[var(--fg-muted)] mb-0.5">
                {row.crime_group}
              </div>

              {/* Row: bar + count + change. On mobile, no fixed label column. */}
              <div className="flex items-center gap-3">
                {/* Desktop label */}
                <div className="hidden sm:block w-44 shrink-0 text-xs text-right text-[var(--fg-muted)] truncate">
                  {row.crime_group}
                </div>
                <div className="flex-1 relative h-5">
                  <div
                    className="absolute inset-y-1 left-0 rounded-sm"
                    style={{
                      width: `${pct}%`,
                      background: "var(--chart-1)",
                      opacity: 0.35,
                    }}
                  />
                </div>
                <div className="w-20 shrink-0 tabular-nums text-xs text-right text-[var(--fg)]">
                  {row.last_12m.toLocaleString("en-GB", {
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div
                  className={`w-14 shrink-0 tabular-nums text-xs text-right ${row.excluded ? "text-[var(--fg-muted)] italic" : "text-[var(--fg-muted)]"}`}
                  title={row.excluded && row.gap_description ? row.gap_description : undefined}
                >
                  {changeText}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-[var(--fg-muted)]">
        Anti-social behaviour is excluded; it is counted separately in the KPIs
        above.
      </p>
      {gapNotes.map((n) => (
        <p key={n.crime_group} className="mt-1 text-xs text-[var(--fg-muted)]">
          {n.crime_group}: police.uk coverage gap from {formatMonth(n.gap_start)}, year-on-year change not shown.
        </p>
      ))}
    </div>
  );
}
