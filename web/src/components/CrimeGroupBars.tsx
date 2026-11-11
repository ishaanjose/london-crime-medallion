"use client";

import { useEffect } from "react";
import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";

type CrimeGroupRow = {
  crime_group: string;
  last_12m: number;
  prior_12m: number;
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
      mx as (select max(month) as m from b)
      select
        crime_group,
        sum(n) filter (where month > m - interval 12 month) as last_12m,
        sum(n) filter (where month <= m - interval 12 month
                       and month > m - interval 24 month)   as prior_12m
      from b, mx
      group by crime_group
      order by last_12m desc
    `;
  });

  useEffect(() => {
    if (data) {
      const total = data.reduce((s, r) => s + r.last_12m, 0);
      console.log("[CrimeGroupBars] sum of last_12m:", total);
    }
  }, [data]);

  if (loading) return <Skeleton />;
  if (error)
    return (
      <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
        {error}
      </pre>
    );
  if (!data) return null;

  const max = Math.max(...data.map((r) => r.last_12m));

  // Column header labels (screen-only, not visible in bars)
  const colClass = "text-xs text-[var(--fg-muted)]";

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center gap-3 mb-1 pb-1 border-b border-[var(--border)]">
        <div className="w-44 shrink-0" />
        <div className="flex-1" />
        <div className={`w-20 shrink-0 text-right ${colClass}`}>Last 12m</div>
        <div className={`w-14 shrink-0 text-right ${colClass}`}>vs prior</div>
      </div>

      <div
        role="img"
        aria-label="Horizontal bars: crime counts by group over the last 12 months, sorted by volume"
        className="space-y-1.5"
      >
        {data.map((row) => {
          const change =
            row.prior_12m > 0
              ? (row.last_12m - row.prior_12m) / row.prior_12m
              : null;
          const changeText =
            change !== null
              ? `${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%`
              : "—";
          const pct = max > 0 ? (row.last_12m / max) * 100 : 0;

          return (
            <div key={row.crime_group} className="flex items-center gap-3">
              <div className="w-44 shrink-0 text-xs text-right text-[var(--fg-muted)] truncate">
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
              <div className="w-14 shrink-0 tabular-nums text-xs text-right text-[var(--fg-muted)]">
                {changeText}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-[var(--fg-muted)]">
        Anti-social behaviour is excluded; it is counted separately in the KPIs
        above.
      </p>
    </div>
  );
}
