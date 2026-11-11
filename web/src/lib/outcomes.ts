import type { ExportIndex } from "@/lib/data";
import { parquet } from "@/lib/query";

// A month counts towards a charge rate only when every row in scope is mature
// and none is impaired. Same rule as the overview KPI.

export type Scope = {
  borough: string | null; // borough_code; null = London
  group: string | null; // crime_group; null = all crime
};

export const scopeKey = (s: Scope) => `${s.borough ?? "london"}|${s.group ?? "all"}`;

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function scopeWhere(s: Scope): string {
  const parts = ["true"];
  if (s.borough) parts.push(`borough_code = ${lit(s.borough)}`);
  if (s.group) parts.push(`crime_group = ${lit(s.group)}`);
  return parts.join(" and ");
}

// The latest 12 crime months that are mature London-wide.
function matureWindowCte(table: string): string {
  return `
    lm as (
      select crime_month
      from ${table}
      group by crime_month
      having bool_and(is_mature)
      order by crime_month desc
      limit 12
    )`;
}

export type ChargeKpiRow = {
  cohort_from: string;
  cohort_to: string;
  charge_rate: number;
};

// Mirrors the charge rate KPI query in app/page.tsx; keep the two in step.
export function buildChargeKpiSql(index: ExportIndex): string {
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
    from usable`;
}

export type OptionRow = { kind: "borough" | "group"; value: string; label: string };

export function buildOptionsSql(index: ExportIndex): string {
  const C = parquet(index, "fct_police_uk_charge_rates");
  return `
    select * from (
      select distinct 'borough' as kind, borough_code as value, borough_name as label from ${C}
      union all
      select distinct 'group', crime_group, crime_group from ${C}
    )
    order by kind, label`;
}

export type TrendRow = {
  month: string; // YYYY-MM
  crimes: number;
  charged: number;
  mature: boolean;
  impaired: boolean;
  // known_outcome_gaps reasons behind an impaired month, newline-separated
  reasons: string | null;
};

export function buildTrendSql(index: ExportIndex, scope: Scope): string {
  const C = parquet(index, "fct_police_uk_charge_rates");
  const KI = parquet(index, "rpt_known_issues");
  return `
    with c as (select * from ${C} where ${scopeWhere(scope)}),
    gaps as (
      select scope as force, start_month, end_month, description
      from ${KI}
      where issue_type = 'outcome gap' and severity in ('degraded', 'collapsed')
    ),
    -- same overlap test as int_police_uk__crime_outcomes.is_outcome_data_impaired
    reasons as (
      select c.crime_month, string_agg(distinct g.description, chr(10)) as reasons
      from c
      join gaps as g
        on g.force = c.force
       and g.start_month <= c.crime_month + interval 12 month
       and g.end_month >= c.crime_month
      where c.is_outcome_data_impaired
      group by c.crime_month
    )
    select
      strftime(c.crime_month, '%Y-%m')      as month,
      sum(c.crimes)::double                 as crimes,
      sum(c.charged_within_12m)::double     as charged,
      bool_and(c.is_mature)                 as mature,
      bool_or(c.is_outcome_data_impaired)   as impaired,
      any_value(r.reasons)                  as reasons
    from c
    left join reasons as r using (crime_month)
    group by c.crime_month
    order by c.crime_month`;
}

export type RankingRow = {
  borough_code: string;
  borough_name: string;
  crimes: number;
  charged: number;
  rate: number | null;
  impaired_months: number;
  window_from: string;
  window_to: string;
  london_rate: number | null;
};

export function buildRankingSql(index: ExportIndex, group: string | null): string {
  const C = parquet(index, "fct_police_uk_charge_rates");
  return `
    with ${matureWindowCte(C)},
    w as (
      select * from ${C}
      where crime_month in (select crime_month from lm)
        and ${scopeWhere({ borough: null, group })}
    ),
    b as (
      select
        borough_code,
        any_value(borough_name)               as borough_name,
        sum(crimes)::double                   as crimes,
        sum(charged_within_12m)::double       as charged,
        count(distinct crime_month) filter (where is_outcome_data_impaired) as impaired_months
      from w
      group by borough_code
    )
    select
      b.*,
      case when crimes > 0 then charged / crimes end           as rate,
      (select strftime(min(crime_month), '%Y-%m') from lm)      as window_from,
      (select strftime(max(crime_month), '%Y-%m') from lm)      as window_to,
      (select sum(charged) / nullif(sum(crimes), 0) from b)     as london_rate
    from b
    order by rate desc nulls last, borough_name`;
}

export const OUTCOME_GROUPS = [
  "Charged",
  "Out-of-court resolution",
  "Unable to prosecute",
  "Not in public interest",
  "Passed to another organisation",
  "No suspect identified",
  "No outcome recorded",
] as const;

export type OutcomeGroup = (typeof OUTCOME_GROUPS)[number];

export type MixRow = {
  period: string; // "latest" or a year
  window_from: string;
  window_to: string;
  final_outcome_group: OutcomeGroup;
  crimes: number;
};

// One bar for the latest 12 mature months, then one per calendar year in
// which every month in scope is mature and unimpaired.
export function buildOutcomeMixSql(index: ExportIndex, scope: Scope): string {
  const O = parquet(index, "fct_police_uk_outcome_mix");
  return `
    with ${matureWindowCte(O)},
    o as (select * from ${O} where ${scopeWhere(scope)}),
    months as (
      select crime_month, bool_and(is_mature) and not bool_or(is_outcome_data_impaired) as usable
      from o
      group by crime_month
    ),
    mx as (select max(crime_month) as m from lm),
    years as (
      select year(crime_month) as y
      from months, mx
      group by y, mx.m
      having bool_and(usable) and make_date(y, 12, 1) <= mx.m
    )
    select
      'latest' as period,
      (select strftime(min(crime_month), '%Y-%m') from lm) as window_from,
      (select strftime(max(crime_month), '%Y-%m') from lm) as window_to,
      final_outcome_group,
      sum(crimes)::double as crimes
    from o
    where crime_month in (select crime_month from lm)
      and crime_month in (select crime_month from months where usable)
    group by final_outcome_group
    union all
    select
      year(crime_month)::varchar,
      null,
      null,
      final_outcome_group,
      sum(crimes)::double
    from o
    where year(crime_month) in (select y from years)
    group by year(crime_month), final_outcome_group`;
}

export const fmtPct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
