"use client";

import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";
import { formatMonth } from "@/lib/format";
import KpiCard from "@/components/KpiCard";
import TrendChart from "@/components/TrendChart";
import CrimeGroupBars from "@/components/CrimeGroupBars";
import DataStamp from "@/components/DataStamp";
import SectionBoundary from "@/components/SectionBoundary";

type KpiRow = {
  month: string;
  crimes: number;
  crimes_prev: number | null;
  asb: number;
  asb_prev: number | null;
  rate_12m: number;
  rate_12m_prev: number | null;
  pop_cur: number | null;
  pop_prev: number | null;
};

type LflRow = {
  excluded_groups: string | null;
  cur_month: number | null;
  prev_month: number | null;
  cur_12m: number | null;
  prev_12m: number | null;
};

type ChargeRow = {
  cohort_from: string;
  cohort_to: string;
  charge_rate: number;
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-muted)] mb-4">
      {children}
    </h2>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
      {message}
    </pre>
  );
}

function change(a: number, b: number | null): number | undefined {
  return b != null && b > 0 ? (a - b) / b : undefined;
}

export default function Home() {
  const kpi = useQuery<KpiRow>((index) => {
    const L = parquet(index, "fct_police_uk_london_month");
    return `
      with l as (select * from ${L})
      select
        strftime(cur.month, '%Y-%m')   as month,
        cur.crime_count::double        as crimes,
        prev.crime_count::double       as crimes_prev,
        cur.asb_count::double          as asb,
        prev.asb_count::double         as asb_prev,
        cur.crimes_per_1000_12m        as rate_12m,
        prev.crimes_per_1000_12m       as rate_12m_prev,
        cur.population::double         as pop_cur,
        prev.population::double        as pop_prev
      from l as cur
      left join l as prev
        on prev.month = (cur.month - interval 12 month)::date
      where cur.month = (select max(month) from l)
    `;
  });

  const charge = useQuery<ChargeRow>((index) => {
    const C = parquet(index, "fct_police_uk_charge_rates");
    return `
      with m as (
        select
          crime_month,
          sum(crimes)::double            as crimes,
          sum(charged_within_12m)::double as charged,
          bool_and(is_mature)             as mature,
          bool_or(is_outcome_data_impaired) as impaired
        from ${C}
        group by crime_month
      ),
      usable as (
        select * from m
        where mature and not impaired
        order by crime_month desc
        limit 12
      )
      select
        strftime(min(crime_month), '%b %Y') as cohort_from,
        strftime(max(crime_month), '%b %Y') as cohort_to,
        sum(charged) / sum(crimes)          as charge_rate
      from usable
    `;
  });

  const lfl = useQuery<LflRow>((index) => {
    const CBM = parquet(index, "fct_police_uk_crimes_borough_month");
    const KI = parquet(index, "rpt_known_issues");
    return `
      with b as (
          select month, crime_group, sum(crime_count)::double as n
          from ${CBM}
          where crime_group <> 'Anti-social behaviour'
          group by all
      ),
      mx as (select max(month) as m from b),
      excluded as (
          select distinct scope as crime_group
          from ${KI}, mx
          where issue_type = 'coverage gap'
            and start_month <= m
            and coalesce(end_month, date '9999-12-01') > (m - interval 24 month)::date
      ),
      kept as (select * from b where crime_group not in (select crime_group from excluded))
      select
          (select string_agg(crime_group, ', ') from excluded) as excluded_groups,
          sum(n) filter (where month = m) as cur_month,
          sum(n) filter (where month = (m - interval 12 month)::date) as prev_month,
          sum(n) filter (where month > m - interval 12 month) as cur_12m,
          sum(n) filter (where month <= m - interval 12 month and month > m - interval 24 month) as prev_12m
      from kept, mx
    `;
  });

  const kpiRow = kpi.data?.[0];
  const chargeRow = charge.data?.[0];
  const lflRow = lfl.data?.[0];
  const kpiLoading = kpi.loading || charge.loading || lfl.loading;
  const kpiError = kpi.error ?? charge.error ?? lfl.error;

  return (
    <main
      className="mx-auto max-w-5xl px-4 py-10"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
          London crime
        </h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Monthly police-recorded offences · Metropolitan Police + City of
          London
        </p>
      </header>

      {/* KPI row */}
      <section className="mb-10" aria-label="Key figures">
        <SectionHeader>Summary</SectionHeader>
        <SectionBoundary>
        {kpiError && <InlineError message={kpiError} />}
        {!kpiError && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
            {kpiLoading || !kpiRow ? (
              <>
                <KpiCard loading />
                <KpiCard loading />
                <KpiCard loading />
                <KpiCard loading />
              </>
            ) : (
              <>
                <KpiCard
                  label="Crimes (latest month)"
                  value={kpiRow.crimes.toLocaleString("en-GB", {
                    maximumFractionDigits: 0,
                  })}
                  sublabel={formatMonth(kpiRow.month)}
                  change={
                    lflRow?.cur_month != null && lflRow?.prev_month != null && lflRow.prev_month > 0
                      ? lflRow.cur_month / lflRow.prev_month - 1
                      : change(kpiRow.crimes, kpiRow.crimes_prev)
                  }
                  note={
                    lflRow?.excluded_groups
                      ? `Change excludes ${lflRow.excluded_groups.toLowerCase()} (police.uk coverage gap)`
                      : undefined
                  }
                />
                <KpiCard
                  label="ASB (latest month)"
                  value={kpiRow.asb.toLocaleString("en-GB", {
                    maximumFractionDigits: 0,
                  })}
                  change={change(kpiRow.asb, kpiRow.asb_prev)}
                />
                <KpiCard
                  label="Crimes per 1,000 (12m)"
                  value={kpiRow.rate_12m.toLocaleString("en-GB", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  change={
                    lflRow?.cur_12m != null && lflRow?.prev_12m != null &&
                    lflRow.prev_12m > 0 && kpiRow.pop_cur != null && kpiRow.pop_prev != null && kpiRow.pop_prev > 0
                      ? (lflRow.cur_12m / kpiRow.pop_cur) / (lflRow.prev_12m / kpiRow.pop_prev) - 1
                      : change(kpiRow.rate_12m, kpiRow.rate_12m_prev)
                  }
                  note={
                    lflRow?.excluded_groups
                      ? `Change excludes ${lflRow.excluded_groups.toLowerCase()} (police.uk coverage gap)`
                      : undefined
                  }
                />
                {chargeRow ? (
                  <KpiCard
                    label="Charge rate (12m cohort)"
                    value={`${(chargeRow.charge_rate * 100).toFixed(1)}%`}
                    sublabel={`Crimes from ${chargeRow.cohort_from} to ${chargeRow.cohort_to}`}
                  />
                ) : (
                  <KpiCard loading />
                )}
              </>
            )}
          </div>
        )}
        </SectionBoundary>
      </section>

      {/* Trend */}
      <section className="mb-10" aria-label="Monthly trend">
        <SectionHeader>Monthly trend</SectionHeader>
        <SectionBoundary><TrendChart /></SectionBoundary>
      </section>

      {/* Crime groups */}
      <section className="mb-10" aria-label="Crimes by group">
        <SectionHeader>Crimes by group · last 12 months</SectionHeader>
        <SectionBoundary><CrimeGroupBars /></SectionBoundary>
      </section>

      <DataStamp />
    </main>
  );
}
