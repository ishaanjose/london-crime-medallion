import type { ExportIndex } from "@/lib/data";
import { parquet, parquetYears, query } from "@/lib/query";
import { formatMonth } from "@/lib/format";
import { coverageGapExcludedCte, lsoaCtes } from "@/lib/place";

const CRIMES = "fct_police_uk_crimes_lsoa_month";
const LSOA_MONTH = "fct_police_uk_lsoa_month";

export const TREND_MONTHS = 24;

// The LSOA code is inlined into SQL; it comes from postcode_lsoa, but check
// its shape anyway.
const LSOA_RE = /^E01\d{6}$/;
function lsoaLiteral(code: string): string {
  if (!LSOA_RE.test(code)) throw new Error(`Unexpected LSOA code: ${code}`);
  return `'${code}'`;
}

type YearMonth = { year: number; month: number };

function latestYear(index: ExportIndex, table: string): number {
  const re = new RegExp(`^${table}/year=(\\d{4})/data_0\\.parquet$`);
  const years = index.files
    .map((f) => re.exec(f.path)?.[1])
    .filter((y): y is string => y != null)
    .map(Number);
  if (years.length === 0) throw new Error(`${table}: no year partitions in export index`);
  return Math.max(...years);
}

// The latest month, read from the newest year partition only, so later
// queries can read just the partitions their window needs. Cached per export
// build; the three area sections share one lookup.
let latestCache: { key: string; value: Promise<YearMonth> } | null = null;

function latestMonth(index: ExportIndex): Promise<YearMonth> {
  const key = `${index.built_at}|${index.git_commit}`;
  if (latestCache?.key !== key) {
    const y = latestYear(index, CRIMES);
    const value = query<{ y: number; m: number }>(
      `select year(max(month)) as y, month(max(month)) as m from ${parquetYears(index, CRIMES, [y])}`,
    ).then(([r]) => {
      if (!r || r.y == null) throw new Error(`${CRIMES}/year=${y}: no rows`);
      return { year: r.y, month: r.m };
    });
    value.catch(() => {
      if (latestCache?.value === value) latestCache = null;
    });
    latestCache = { key, value };
  }
  return latestCache.value;
}

// Calendar years touched by the `months`-month window ending at `latest`.
function windowYears(latest: YearMonth, months: number): number[] {
  const first = Math.floor((latest.year * 12 + latest.month - 1 - (months - 1)) / 12);
  return Array.from({ length: latest.year - first + 1 }, (_, i) => first + i);
}

// ---- Summary and headline ---------------------------------------------------

export type AreaSummaryRow = {
  lsoa21_code: string;
  lsoa21_name: string | null;
  borough_name: string | null;
  rate_per_1000: number | null;
  crimes: number;
  pop: number | null;
  low_pop: boolean;
  imd_decile_2025: number | null;
  income_decile_2025: number | null;
  nearest_station_name: string | null;
  nearest_station_m: number | null;
  nearest_park_entrance_m: number | null;
  london_median: number | null;
  london_n: number;
  london_below: number | null;
  latest_month: string;
  excluded_groups: string | null;
};

// Same rate as the place page (lsoaCtes): 12 months, per 1,000 residents,
// no ASB, no crime groups with a coverage gap in the window. The London
// median is over LSOAs that are not low-population, as on the place page.
export async function buildAreaSummarySql(index: ExportIndex, lsoa: string): Promise<string> {
  const years = windowYears(await latestMonth(index), 12);
  const DIM = parquet(index, "dim_lsoa");
  return `
    with ${lsoaCtes(index, years)},
    ref as (
      select quantile_cont(rate_per_1000, 0.5) as london_median, count(*) as london_n
      from lsoa
      where rate_per_1000 is not null
    )
    select
      a.lsoa21_code,
      d.lsoa21_name,
      d.borough_name,
      a.rate_per_1000,
      a.crimes,
      a.pop,
      a.low_pop,
      a.imd_decile_2025,
      a.income_decile_2025,
      d.nearest_station_name,
      a.nearest_station_m,
      a.nearest_park_entrance_m,
      ref.london_median,
      ref.london_n,
      (select count(*) from lsoa where rate_per_1000 < a.rate_per_1000) as london_below,
      strftime(mx.m, '%Y-%m') as latest_month,
      (select string_agg(crime_group, ', ' order by crime_group) from excluded) as excluded_groups
    from lsoa_all as a
    join ${DIM} as d using (lsoa21_code)
    cross join ref
    cross join mx
    where a.lsoa21_code = ${lsoaLiteral(lsoa)}`;
}

const fmt1 = (v: number) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// One plain-words sentence comparing this LSOA with the London median.
export function areaHeadline(r: AreaSummaryRow): string {
  const period = `In the 12 months to ${formatMonth(r.latest_month)}`;
  if (r.rate_per_1000 == null) {
    return `${period}, this area has no population estimate, so its crime rate can’t be worked out.`;
  }
  const rate = `${fmt1(r.rate_per_1000)} crimes per 1,000 residents`;
  if (r.london_median == null || r.london_median <= 0) {
    return `${period}, this area recorded ${rate}.`;
  }
  const median = `the median London LSOA (${fmt1(r.london_median)})`;
  const ratio = r.rate_per_1000 / r.london_median;
  let comparison: string;
  if (ratio >= 1.5) {
    const times = ratio >= 10 ? Math.round(ratio).toLocaleString("en-GB") : ratio.toFixed(1);
    comparison = `about ${times} times ${median}`;
  } else if (ratio >= 1.1) {
    comparison = `about ${Math.round((ratio - 1) * 100)}% higher than ${median}`;
  } else if (ratio > 0.9) {
    comparison = `close to ${median}`;
  } else {
    comparison = `about ${Math.round((1 - ratio) * 100)}% lower than ${median}`;
  }
  return `${period}, this area recorded ${rate}, ${comparison}.`;
}

// Where the rate sits among London LSOAs, e.g. "That is higher than 87% of
// London LSOAs." The ends say "highest/lowest 1%" so rounding never claims
// 0% or 100%.
export function areaRankLine(r: AreaSummaryRow): string | null {
  if (r.rate_per_1000 == null || r.london_below == null || r.london_n === 0) return null;
  const share = r.london_below / r.london_n;
  if (share >= 0.99) return "That is among the highest 1% of London LSOAs.";
  if (share < 0.01) return "That is among the lowest 1% of London LSOAs.";
  return `That is higher than ${Math.round(share * 100)}% of London LSOAs.`;
}

// ---- 24-month trend ---------------------------------------------------------

export type AreaTrendRow = {
  month: string;
  area_rate: number | null;
  london_median: number | null;
  excluded_groups: string | null;
};

// Monthly crimes per 1,000 residents, each month over that month's
// population. The London line is the median of LSOAs not flagged
// low-population in that month. Exclusions use the 24-month window.
export async function buildAreaTrendSql(index: ExportIndex, lsoa: string): Promise<string> {
  const years = windowYears(await latestMonth(index), TREND_MONTHS);
  const CLM = parquetYears(index, CRIMES, years);
  const LM = parquetYears(index, LSOA_MONTH, years);
  return `
    with
    clm as (select * from ${CLM}),
    mx as (select max(month) as m from clm),
    ${coverageGapExcludedCte(index, TREND_MONTHS).trim()},
    crimes as (
      select lsoa21_code, month, sum(crime_count)::double as n
      from clm, mx
      where month > m - interval ${TREND_MONTHS} month
        and month <= m
        and crime_group is distinct from 'Anti-social behaviour'
        and coalesce(crime_group, 'Unmapped') not in (select crime_group from excluded)
      group by all
    ),
    r as (
      select
        lm.lsoa21_code,
        lm.month,
        coalesce(lm.is_low_population, false) as low_pop,
        case when lm.population > 0 then coalesce(c.n, 0) * 1000.0 / lm.population end as rate
      from ${LM} as lm
      cross join mx
      left join crimes as c
        on c.lsoa21_code = lm.lsoa21_code and c.month = lm.month
      where lm.month > m - interval ${TREND_MONTHS} month
        and lm.month <= m
    )
    select
      strftime(month, '%Y-%m') as month,
      max(rate) filter (where lsoa21_code = ${lsoaLiteral(lsoa)}) as area_rate,
      quantile_cont(rate, 0.5) filter (where not low_pop and rate is not null) as london_median,
      (select string_agg(crime_group, ', ' order by crime_group) from excluded) as excluded_groups
    from r
    group by month
    order by month`;
}

// ---- Crime group mix --------------------------------------------------------

export type AreaMixRow = {
  crime_group: string;
  area_n: number;
  london_n: number;
  area_share: number | null;
  london_share: number;
  latest_month: string;
  excluded_groups: string | null;
};

// Share of each crime group in the 12-month total, for this LSOA and for all
// London LSOAs. Same exclusions as the headline rate.
export async function buildAreaMixSql(index: ExportIndex, lsoa: string): Promise<string> {
  const years = windowYears(await latestMonth(index), 12);
  const CLM = parquetYears(index, CRIMES, years);
  return `
    with
    clm as (select * from ${CLM}),
    mx as (select max(month) as m from clm),
    ${coverageGapExcludedCte(index, 12).trim()},
    g as (
      select
        coalesce(crime_group, 'Unmapped') as crime_group,
        coalesce(sum(crime_count) filter (where lsoa21_code = ${lsoaLiteral(lsoa)}), 0)::double as area_n,
        sum(crime_count)::double as london_n
      from clm, mx
      where month > m - interval 12 month
        and month <= m
        and crime_group is distinct from 'Anti-social behaviour'
        and coalesce(crime_group, 'Unmapped') not in (select crime_group from excluded)
      group by 1
    )
    select
      crime_group,
      area_n,
      london_n,
      area_n / nullif(sum(area_n) over (), 0) as area_share,
      london_n / sum(london_n) over () as london_share,
      (select strftime(m, '%Y-%m') from mx) as latest_month,
      (select string_agg(crime_group, ', ' order by crime_group) from excluded) as excluded_groups
    from g
    order by london_n desc`;
}
