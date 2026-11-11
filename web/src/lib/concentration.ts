import type { ExportIndex } from "@/lib/data";
import { parquet } from "@/lib/query";
import { chart } from "@/lib/theme";

export type Level = "lsoa" | "point";

export type LevelConfig = {
  label: string;
  // Plural noun used in sentences, e.g. "18% of LSOAs".
  plural: string;
  color: string;
};

export const LEVELS: Record<Level, LevelConfig> = {
  lsoa: { label: "LSOA", plural: "LSOAs", color: chart.crimes },
  point: { label: "Street point", plural: "street points", color: chart.avg12m },
};

export const POINT_REPLACED_REASON =
  "police.uk replaced its map-point set in this year, so street points can’t be compared.";

export type SummaryRow = {
  year: number;
  place_level: Level;
  n_places: number;
  total_crimes: number;
  pct_places_for_half_of_crime: number;
  gini: number;
};

export type CurveRow = {
  pct_places: number;
  pct_crime: number;
};

export function buildSummarySql(index: ExportIndex): string {
  const S = parquet(index, "rpt_crime_concentration_summary");
  return `
    select year, place_level, n_places, total_crimes, pct_places_for_half_of_crime, gini
    from ${S}
    order by year, place_level`;
}

export function buildCurveSql(index: ExportIndex, year: number, level: Level): string {
  if (!Number.isInteger(year)) throw new Error(`Invalid year: ${year}`);
  if (!(level in LEVELS)) throw new Error(`Invalid level: ${level}`);
  const C = parquet(index, "rpt_crime_concentration");
  return `
    select pct_places, pct_crime
    from ${C}
    where year = ${year} and place_level = '${level}'
    order by pct_places`;
}

// Rounded to two significant figures: 899 -> 900, 6,862 -> 6,900.
export function aboutCount(n: number): number {
  if (n < 10) return Math.round(n);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

export const fmtInt = (v: number) => v.toLocaleString("en-GB");
export const fmtPct0 = (v: number) => `${Math.round(v)}%`;
export const fmtGini = (v: number) => v.toFixed(2);

export function headline(row: SummaryRow): string {
  const { plural } = LEVELS[row.place_level];
  const pct = row.pct_places_for_half_of_crime;
  const count = aboutCount((row.n_places * pct) / 100);
  return `In ${row.year}, ${pct}% of ${plural} (about ${fmtInt(count)} of ${fmtInt(row.n_places)}) account for half of recorded crime.`;
}
