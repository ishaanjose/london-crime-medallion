import type { ExportIndex } from "@/lib/data";
import { parquet, parquetYears } from "@/lib/query";
import {
  IMD_PRESET, INCOME_PRESET, EMPLOYMENT_PRESET, STATION_PRESET, PARK_DISTANCE_PRESET, PARK_PRESET,
  PARK_COUNT_PRESET,
  type FixedPreset,
} from "@/lib/classify";

export type Factor = "income" | "employment" | "imd" | "station" | "parkdist" | "park" | "parkcount";

export type FactorConfig = {
  column: string;
  preset: FixedPreset;
  axisLabel: string;
  // How the takeaway describes the first and last bands.
  firstBand: string;
  lastBand: string;
};

export const FACTORS: Record<Factor, FactorConfig> = {
  income: {
    column: "income_decile_2025",
    preset: INCOME_PRESET,
    axisLabel: "Income deprivation 2025 decile (1 = most deprived)",
    firstBand: "in the most income-deprived decile",
    lastBand: "in the least",
  },
  employment: {
    column: "employment_decile_2025",
    preset: EMPLOYMENT_PRESET,
    axisLabel: "Employment deprivation 2025 decile (1 = most deprived)",
    firstBand: "in the most employment-deprived decile",
    lastBand: "in the least",
  },
  imd: {
    column: "imd_decile_2025",
    preset: IMD_PRESET,
    axisLabel: "IMD 2025 decile (1 = most deprived)",
    firstBand: "in the most deprived IMD decile",
    lastBand: "in the least",
  },
  station: {
    column: "nearest_station_m",
    preset: STATION_PRESET,
    axisLabel: "Distance to nearest station",
    firstBand: "within 250 m of a station",
    lastBand: "more than 2,000 m from one",
  },
  parkdist: {
    column: "nearest_park_entrance_m",
    preset: PARK_DISTANCE_PRESET,
    axisLabel: "Distance to nearest park entrance",
    firstBand: "within 100 m of a park entrance",
    lastBand: "more than 750 m from one",
  },
  park: {
    column: "park_ha_within_1km",
    preset: PARK_PRESET,
    axisLabel: "Park area within 1 km",
    firstBand: "with under 5 ha of park within 1 km",
    lastBand: "with 80 ha or more",
  },
  parkcount: {
    column: "park_count_within_1km",
    preset: PARK_COUNT_PRESET,
    axisLabel: "Park sites within 1 km",
    firstBand: "with 2 or fewer parks within 1 km",
    lastBand: "with 18 or more",
  },
};

// The crimes table is partitioned by year. The 12-month window to the latest
// month spans at most the latest year and the one before.
function windowYears(index: ExportIndex, table: string): number[] {
  const re = new RegExp(`^${table}/year=(\\d{4})/data_0\\.parquet$`);
  const years = index.files
    .map((f) => re.exec(f.path)?.[1])
    .filter((y): y is string => y != null)
    .map(Number);
  if (years.length === 0) throw new Error(`${table}: no year partitions in export index`);
  const max = Math.max(...years);
  return years.filter((y) => y >= max - 1).sort();
}

// Crime groups with a registered coverage gap overlapping the `months`-month
// window to the latest month. Expects a CTE `mx` with the latest month as `m`.
export function coverageGapExcludedCte(index: ExportIndex, months: number): string {
  const KI = parquet(index, "rpt_known_issues");
  return `
    excluded as (
      select distinct scope as crime_group
      from ${KI}, mx
      where issue_type = 'coverage gap'
        and start_month <= m
        and coalesce(end_month, date '9999-12-01') > (m - interval ${months} month)::date
    )`;
}

// CTEs ending in `lsoa`: one row per LSOA with its 12-month crime rate and
// the factor columns. Excludes ASB, crime groups with a coverage gap
// overlapping the window (same rule as CrimeGroupBars), and LSOAs flagged
// low-population at the latest month. `lsoa_all` is the same before the
// low-population filter, plus `low_pop`, `pop` and `crimes`.
// `years` overrides the partitions read; it must cover the 12-month window.
export function lsoaCtes(index: ExportIndex, years?: number[]): string {
  const CLM = parquetYears(index, "fct_police_uk_crimes_lsoa_month", years ?? windowYears(index, "fct_police_uk_crimes_lsoa_month"));
  const LM = parquetYears(index, "fct_police_uk_lsoa_month", years ?? windowYears(index, "fct_police_uk_lsoa_month"));
  const DIM = parquet(index, "dim_lsoa");
  const cols = [...new Set(Object.values(FACTORS).map((f) => f.column))];

  return `
    clm as (select * from ${CLM}),
    mx as (select max(month) as m from clm),
    ${coverageGapExcludedCte(index, 12).trim()},
    crimes as (
      select lsoa21_code, sum(crime_count)::double as n
      from clm, mx
      where month > m - interval 12 month
        and month <= m
        and crime_group is distinct from 'Anti-social behaviour'
        and coalesce(crime_group, 'Unmapped') not in (select crime_group from excluded)
      group by 1
    ),
    pop as (
      select lsoa21_code, population::double as pop, coalesce(is_low_population, false) as low_pop
      from ${LM}, mx
      where month = m
    ),
    lsoa_all as (
      select
        d.lsoa21_code,
        case when p.pop > 0 then coalesce(c.n, 0) * 1000.0 / p.pop end as rate_per_1000,
        ${cols.map((c) => `d.${c}`).join(",\n        ")},
        p.low_pop,
        p.pop,
        coalesce(c.n, 0) as crimes
      from ${DIM} as d
      join pop as p using (lsoa21_code)
      left join crimes as c using (lsoa21_code)
    ),
    lsoa as (
      select * exclude (low_pop, pop, crimes)
      from lsoa_all
      where not low_pop
    )`;
}

export type LsoaFactorRow = {
  lsoa21_code: string;
  rate_per_1000: number | null;
  imd_decile_2025: number | null;
  income_decile_2025: number | null;
  employment_decile_2025: number | null;
  nearest_station_m: number | null;
  nearest_park_entrance_m: number | null;
  park_ha_within_1km: number | null;
  park_count_within_1km: number | null;
};

export function buildLsoaFactorsSql(index: ExportIndex): string {
  return `with ${lsoaCtes(index)} select * from lsoa order by lsoa21_code`;
}

// 0-based band index for a value under a preset, matching classifyFixed.
function bandExpr(col: string, preset: FixedPreset): string {
  const op = preset.closed === "lower" ? ">=" : ">";
  return `(${preset.edges.map((e) => `(${col} ${op} ${e})::int`).join(" + ")})`;
}

// Average rank, so ties (every LSOA in a decile) share one rank as Spearman
// assumes. Plain rank() gives tied values the lowest rank in the group.
const avgRank = (col: string) =>
  `(rank() over (order by ${col}) + (count(*) over (partition by ${col}) - 1) / 2.0)`;

export type BinnedRateRow = {
  band: number;
  n: number;
  p25: number;
  median: number;
  p75: number;
  spearman: number | null;
  latest_month: string;
  excluded_groups: string | null;
  low_pop_n: number;
};

export function buildBinnedRateSql(index: ExportIndex, factor: Factor): string {
  const { column, preset } = FACTORS[factor];
  return `
    with ${lsoaCtes(index)},
    x as (
      select rate_per_1000 as rate, ${column} as v, ${bandExpr(column, preset)} as band
      from lsoa
      where rate_per_1000 is not null and ${column} is not null
    ),
    s as (
      select corr(rv, rr) as spearman
      from (select ${avgRank("v")} as rv, ${avgRank("rate")} as rr from x)
    )
    select
      band,
      count(*) as n,
      quantile_cont(rate, 0.25) as p25,
      quantile_cont(rate, 0.5) as median,
      quantile_cont(rate, 0.75) as p75,
      any_value(s.spearman) as spearman,
      strftime(any_value(mx.m), '%Y-%m') as latest_month,
      (select string_agg(crime_group, ', ' order by crime_group) from excluded) as excluded_groups,
      (select count(*) from pop where low_pop) as low_pop_n
    from x, s, mx
    group by band
    order by band`;
}

export function strengthLabel(rho: number): string {
  const a = Math.abs(rho);
  if (a < 0.1) return "no clear relationship";
  if (a < 0.3) return "weak";
  if (a < 0.5) return "moderate";
  return "strong";
}
