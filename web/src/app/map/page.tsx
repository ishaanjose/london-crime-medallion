"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadIndex, type ExportIndex } from "@/lib/data";
import { parquet, parquetYears, query } from "@/lib/query";
import { formatMonth } from "@/lib/format";
import {
  classify, fixedClasses, IMD_PRESET, INCOME_PRESET, STATION_PRESET, PARK_DISTANCE_PRESET, PARK_PRESET, PARK_COUNT_PRESET, type FixedPreset,
} from "@/lib/classify";
import LsoaMap, {
  contextValue, type LsoaValue, type DimRow, type MapLayer, type ContextLayer,
} from "@/components/LsoaMap";
import MapLegend, { FixedLegend } from "@/components/MapLegend";
import SectionBoundary from "@/components/SectionBoundary";
import BinnedRateChart from "@/components/place/BinnedRateChart";
import "maplibre-gl/dist/maplibre-gl.css";

// ---- Types ----------------------------------------------------------------

type MonthRow = { month: string };
type CrimeGroupRow = { crime_group: string };
type KnownIssueRow = {
  issue_type: string;
  scope: string;
  description: string;
  start_month: string;
  end_month: string | null;
};

type MapValueRow = {
  lsoa21_code: string;
  n: number;
  pop: number | null;
  low_pop: boolean;
  per_1000: number | null;
};

type DimLsoaRow = DimRow;

const DIM_COLUMNS = [
  "lsoa21_code", "lsoa21_name", "borough_name",
  "imd_decile_2025", "income_decile_2025", "employment_decile_2025",
  "nearest_station_m", "nearest_station_name", "nearest_station_network", "stations_within_1km",
  "nearest_park_entrance_m", "nearest_park_name", "nearest_park_function", "park_ha_within_1km", "park_count_within_1km",
].join(", ");

// ---- Context layers ---------------------------------------------------------

const LAYERS: { value: MapLayer; label: string }[] = [
  { value: "crime", label: "Crime" },
  { value: "imd", label: "Deprivation (IMD 2025)" },
  { value: "income", label: "Income deprivation (2025)" },
  { value: "station", label: "Distance to nearest station" },
  { value: "park", label: "Park space nearby" },
  { value: "parkcount", label: "Parks within 1 km" },
  { value: "parkdist", label: "Distance to nearest park entrance" },
];

const CRIME_HEADING = {
  title: "LSOA crime map",
  subtitle: "Police-recorded offences by Lower Super Output Area",
};

const CONTEXT: Record<ContextLayer, {
  title: string;
  subtitle: string;
  preset: FixedPreset;
  legendTitle: string;
  // Labels for the first and last legend rows, which are in ascending value order
  legendEnds?: { first: string; last: string };
  ariaLabel: string;
  caveat: string;
}> = {
  imd: {
    title: "LSOA deprivation map",
    subtitle: "Index of Multiple Deprivation 2025 decile by Lower Super Output Area",
    preset: IMD_PRESET,
    legendTitle: "IMD 2025 decile",
    ariaLabel: "LSOA map: Index of Multiple Deprivation 2025 decile",
    caveat: "IMD 2025 overall deprivation. Includes a crime domain, so compare with crime carefully.",
  },
  income: {
    title: "LSOA income deprivation map",
    subtitle: "Income Deprivation Domain 2025 decile by Lower Super Output Area",
    preset: INCOME_PRESET,
    legendTitle: "Income deprivation 2025 decile",
    ariaLabel: "LSOA map: Income Deprivation Domain 2025 decile",
    caveat: "Share of residents on low-income benefits, ranked against all of England. Unlike the overall IMD it has no crime domain, so it is the cleaner comparison with crime.",
  },
  station: {
    title: "Distance to nearest station",
    subtitle: "Distance to the nearest station by Lower Super Output Area",
    preset: STATION_PRESET,
    legendTitle: "Distance to nearest station",
    legendEnds: { first: "Closer to a station", last: "Further from a station" },
    ariaLabel: "LSOA map: straight-line distance to nearest station",
    caveat: "Measured from the area’s population-weighted centre (where residents live) to the nearest TfL or National Rail station, straight-line. Areas near stations are busier, so the link with crime is correlation, not cause.",
  },
  parkdist: {
    title: "Distance to nearest park entrance",
    subtitle: "Distance to the nearest park entrance by Lower Super Output Area",
    preset: PARK_DISTANCE_PRESET,
    legendTitle: "Distance to nearest park entrance",
    legendEnds: { first: "Closer to a park", last: "Further from a park" },
    ariaLabel: "LSOA map: straight-line distance to nearest park entrance",
    caveat: "Measured from the area’s population-weighted centre (where residents live) to the nearest foot entrance of a public park, garden or playing field. An area next to or inside a large park can still be tens of metres from a gate. Counts public parks, gardens and playing fields (OS Open Greenspace). Woodland, Green Belt, nature reserves, allotments and private gardens are not included. The link with crime is correlation, not cause, and mostly tracks how built-up an area is.",
  },
  park: {
    title: "LSOA park access map",
    subtitle: "Public park area within 1 km by Lower Super Output Area",
    preset: PARK_PRESET,
    legendTitle: "Park area within 1 km",
    legendEnds: { first: "Less park area", last: "More park area" },
    ariaLabel: "LSOA map: hectares of park within 1 km",
    caveat: "Counts public parks, gardens and playing fields (OS Open Greenspace) within 1 km of the population-weighted centre. Woodland, Green Belt, nature reserves, allotments and private gardens are not included. The link with crime is correlation, not cause, and mostly tracks how built-up an area is.",
  },
  parkcount: {
    title: "LSOA park count map",
    subtitle: "Park sites within 1 km by Lower Super Output Area",
    preset: PARK_COUNT_PRESET,
    legendTitle: "Parks within 1 km",
    legendEnds: { first: "Fewer parks", last: "More parks" },
    ariaLabel: "LSOA map: number of park sites within 1 km",
    caveat: "Distinct public parks, gardens and playing fields (OS Open Greenspace) whose grounds reach within 1 km of the population-weighted centre. A borough park and the playing field inside it count separately. A park site counts once whatever its size. See Park area within 1 km for how much green space is nearby. Woodland, Green Belt, nature reserves, allotments and private gardens are not included. The count mostly tracks how built-up an area is, so its link with crime is correlation, not cause.",
  },
};

function isMapLayer(v: string | null): v is MapLayer {
  return v === "crime" || v === "imd" || v === "income" || v === "station" || v === "parkdist" || v === "park" || v === "parkcount";
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const fmtInt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });

function contextSummary(layer: ContextLayer, dim: Map<string, DimRow>): string | null {
  const vals: number[] = [];
  for (const d of dim.values()) {
    const v = contextValue(d, layer);
    if (v != null) vals.push(v);
  }
  if (vals.length === 0) return null;
  const n = vals.length;
  switch (layer) {
    case "imd": {
      const k = vals.filter((v) => v <= 3).length;
      const pct = ((k / n) * 100).toLocaleString("en-GB", { maximumFractionDigits: 0 });
      return `${pct}% of London LSOAs (${fmtInt(k)} of ${fmtInt(n)}) are in IMD deciles 1 to 3, the most deprived 30% in England.`;
    }
    case "income": {
      const k = vals.filter((v) => v <= 3).length;
      const pct = ((k / n) * 100).toLocaleString("en-GB", { maximumFractionDigits: 0 });
      return `${pct}% of London LSOAs (${fmtInt(k)} of ${fmtInt(n)}) are in income deciles 1 to 3, the most income-deprived 30% in England.`;
    }
    case "station": {
      const k = vals.filter((v) => v > 1500).length;
      return `Median distance to the nearest station is ${fmtInt(median(vals))} m. ${fmtInt(k)} of ${fmtInt(n)} LSOAs are more than 1,500 m from one.`;
    }
    case "parkdist": {
      const k = vals.filter((v) => v > 500).length;
      return `Median distance to the nearest park entrance is ${fmtInt(median(vals))} m. ${fmtInt(k)} of ${fmtInt(n)} LSOAs are more than 500 m from one.`;
    }
    case "park": {
      const med = median(vals).toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const k = vals.filter((v) => v < 5).length;
      return `Median park area within 1 km is ${med} ha. ${fmtInt(k)} of ${fmtInt(n)} LSOAs have under 5 ha.`;
    }
    case "parkcount": {
      const k = vals.filter((v) => v < 3).length;
      return `The median LSOA has ${fmtInt(median(vals))} park sites within 1 km. ${fmtInt(k)} of ${fmtInt(n)} LSOAs have 2 or fewer.`;
    }
  }
}

// ---- Helpers ----------------------------------------------------------------

function yearsInWindow(endMonth: string, windowMonths: number): number[] {
  const [ey, em] = endMonth.split("-").map(Number);
  const startDate = new Date(ey, em - 1 - windowMonths, 1);
  const endDate = new Date(ey, em - 1, 1);
  const years = new Set<number>();
  for (let y = startDate.getFullYear(); y <= endDate.getFullYear(); y++) {
    years.add(y);
  }
  return [...years];
}

function buildCrimeFilter(group: string): string {
  if (group === "all") return "crime_group <> 'Anti-social behaviour'";
  if (group === "asb") return "crime_group = 'Anti-social behaviour'";
  const escaped = group.replace(/'/g, "''");
  return `crime_group = '${escaped}'`;
}

function existingYears(index: ExportIndex, table: string, years: number[]): number[] {
  return years.filter((y) =>
    index.files.some((f) => f.path === `${table}/year=${y}/data_0.parquet`)
  );
}

function buildValuesQuery(
  index: ExportIndex,
  endMonth: string,
  windowMonths: number,
  group: string
): string {
  const allYears = yearsInWindow(endMonth, windowMonths);
  const clmYears = existingYears(index, "fct_police_uk_crimes_lsoa_month", allYears);
  const lmYears = existingYears(index, "fct_police_uk_lsoa_month", [Number(endMonth.split("-")[0])]);

  const DIM = parquet(index, "dim_lsoa");
  const filter = buildCrimeFilter(group);

  const cCte = clmYears.length > 0
    ? `select lsoa21_code, sum(crime_count)::double as n
       from ${parquetYears(index, "fct_police_uk_crimes_lsoa_month", clmYears)}
       where month > (date '${endMonth}-01' - interval ${windowMonths} month)
         and month <= date '${endMonth}-01'
         and ${filter}
       group by 1`
    : `select null::varchar as lsoa21_code, 0.0 as n where false`;

  const pCte = lmYears.length > 0
    ? `select lsoa21_code, any_value(population)::double as pop, bool_or(is_low_population) as low_pop
       from ${parquetYears(index, "fct_police_uk_lsoa_month", lmYears)}
       where month = date '${endMonth}-01'
       group by 1`
    : `select null::varchar as lsoa21_code, null::double as pop, false as low_pop where false`;

  return `
    with c as (${cCte}),
    p as (${pCte})
    select
      d.lsoa21_code,
      coalesce(c.n, 0) as n,
      p.pop, p.low_pop,
      case when p.pop > 0 then coalesce(c.n, 0) * 1000.0 / p.pop end as per_1000
    from ${DIM} as d
    left join c using (lsoa21_code)
    left join p using (lsoa21_code)
  `;
}

// ---- URL state hook -------------------------------------------------------

type MapSelection = {
  layer: MapLayer;
  group: string;      // "all" | "asb" | crime group name
  period: "12m" | "1m";
  end: string;        // YYYY-MM
  measure: "rate" | "count";
};

function useMapSelection(availableMonths: string[]): [MapSelection, (k: keyof MapSelection, v: string) => void] {
  const router = useRouter();
  const sp = useSearchParams();

  const latestMonth = availableMonths[0] ?? "";

  const layerParam = sp.get("layer");
  const sel: MapSelection = {
    layer:   isMapLayer(layerParam) ? layerParam : "crime",
    group:   sp.get("group")   ?? "all",
    period:  (sp.get("period") === "1m" ? "1m" : "12m") as "12m" | "1m",
    end:     sp.get("end")     ?? latestMonth,
    measure: (sp.get("measure") === "count" ? "count" : "rate") as "rate" | "count",
  };

  const setParam = useCallback((k: keyof MapSelection, v: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set(k, v);
    router.replace(`/map?${params.toString()}`, { scroll: false });
  }, [router, sp]);

  return [sel, setParam];
}

// ---- Theme hook -------------------------------------------------------------

function readIsDark(): boolean {
  if (typeof window === "undefined") return false;
  const theme = document.documentElement.dataset.theme;
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Tracks the effective theme: an explicit data-theme on <html> wins, else the OS preference.
function useIsDark(): boolean {
  const [dark, setDark] = useState(readIsDark);

  useEffect(() => {
    const update = () => setDark(readIsDark());
    update();

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      mq.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  return dark;
}

// ---- Skeleton & Error -------------------------------------------------------

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--skeleton)] ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
      {message}
    </pre>
  );
}

// ---- Coverage notice --------------------------------------------------------

function CoverageNotice({
  issues,
  group,
  endMonth,
  windowMonths,
}: {
  issues: KnownIssueRow[];
  group: string;
  endMonth: string;
  windowMonths: number;
}) {
  const windowStart = (() => {
    const [ey, em] = endMonth.split("-").map(Number);
    const d = new Date(ey, em - 1 - windowMonths, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const relevant = issues.filter((iss) => {
    if (iss.issue_type !== "coverage gap") return false;
    const gapStart = iss.start_month.slice(0, 7);
    const gapEnd = iss.end_month ? iss.end_month.slice(0, 7) : "9999-99";
    // Overlaps if gap started before or during window, and hasn't ended before window start
    return gapStart <= endMonth && gapEnd > windowStart;
  });

  if (relevant.length === 0) return null;

  const notices = relevant.filter((iss) =>
    group === "all" || group === iss.scope || group === iss.scope.toLowerCase()
  );

  if (notices.length === 0) return null;

  return (
    <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 mb-4 text-xs text-amber-800 dark:text-amber-200 space-y-1">
      {notices.map((iss) => {
        const startLabel = formatMonth(iss.start_month.slice(0, 7));
        if (group === "all") {
          return (
            <p key={iss.scope}>
              All-crime totals undercount <strong>{iss.scope.toLowerCase()}</strong>: police.uk coverage gap from {startLabel}.
            </p>
          );
        }
        return (
          <p key={iss.scope}>
            <strong>{iss.scope}</strong>: police.uk coverage gap from {startLabel}. Counts in this period are undercounted.
          </p>
        );
      })}
    </div>
  );
}

// ---- Top 10 list ------------------------------------------------------------

function Top10({ values, dim, measure }: {
  values: LsoaValue[];
  dim: Map<string, DimRow>;
  measure: "rate" | "count";
}) {
  const sorted = useMemo(() => {
    return [...values]
      .filter((v) => measure === "count" || !v.low_pop)
      .sort((a, b) => {
        const av = measure === "rate" ? (a.per_1000 ?? 0) : a.n;
        const bv = measure === "rate" ? (b.per_1000 ?? 0) : b.n;
        return bv - av;
      })
      .slice(0, 10);
  }, [values, measure]);

  if (sorted.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-muted)] mb-3">
        Top 10 LSOAs
      </h2>
      <div className="space-y-1">
        {sorted.map((v, i) => {
          const d = dim.get(v.lsoa21_code);
          const val = measure === "rate" ? v.per_1000 : v.n;
          const formatted =
            val == null
              ? "—"
              : measure === "rate"
              ? val.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : val.toLocaleString("en-GB", { maximumFractionDigits: 0 });
          return (
            <div key={v.lsoa21_code} className="flex items-baseline gap-2 text-xs">
              <span className="tabular-nums text-[var(--fg-muted)] w-5 shrink-0">{i + 1}.</span>
              <span className="text-[var(--fg)] truncate flex-1 min-w-0">
                {d?.lsoa21_name ?? v.lsoa21_code}
              </span>
              <span className="text-[var(--fg-muted)] shrink-0 truncate max-w-[120px]">{d?.borough_name}</span>
              <span className="tabular-nums text-[var(--fg)] shrink-0">{formatted}</span>
            </div>
          );
        })}
      </div>
      {measure === "rate" && (
        <p className="mt-3 text-xs text-[var(--fg-muted)]">
          Per-resident rates are high where few people live but many visit, e.g. the West End. Switch to Count to compare volumes.
        </p>
      )}
    </div>
  );
}

// ---- Main page (needs Suspense for useSearchParams) -------------------------

function MapPageInner() {
  const [index, setIndex] = useState<ExportIndex | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [crimeGroups, setCrimeGroups] = useState<string[]>([]);
  const [issues, setIssues] = useState<KnownIssueRow[]>([]);
  const [dim, setDim] = useState<Map<string, DimRow>>(new Map());

  const [valuesLoading, setValuesLoading] = useState(false);
  const [valuesError, setValuesError] = useState<string | null>(null);
  const [values, setValues] = useState<LsoaValue[]>([]);

  const [metaLoaded, setMetaLoaded] = useState(false);

  const [sel, setParam] = useMapSelection(availableMonths);

  const dark = useIsDark();

  // Load metadata once
  useEffect(() => {
    (async () => {
      try {
        const idx = await loadIndex();
        setIndex(idx);

        const [monthRows, groupRows, issueRows, dimRows] = await Promise.all([
          query<MonthRow>(`select distinct strftime(month, '%Y-%m') as month from ${parquet(idx, "fct_police_uk_london_month")} order by month desc`),
          query<CrimeGroupRow>(`select distinct crime_group from ${parquet(idx, "fct_police_uk_crimes_borough_month")} where crime_group is not null order by crime_group`),
          query<KnownIssueRow>(`select issue_type, scope, description, strftime(start_month, '%Y-%m-%d') as start_month, strftime(end_month, '%Y-%m-%d') as end_month from ${parquet(idx, "rpt_known_issues")} where issue_type = 'coverage gap'`),
          query<DimLsoaRow>(`select ${DIM_COLUMNS} from ${parquet(idx, "dim_lsoa")}`),
        ]);

        setAvailableMonths(monthRows.map((r) => r.month));
        const groups = groupRows
          .map((r) => r.crime_group)
          .filter((g) => g !== "Anti-social behaviour");
        setCrimeGroups(groups);
        setIssues(issueRows);
        setDim(new Map(dimRows.map((r) => [r.lsoa21_code, r])));
        setMetaLoaded(true);
      } catch (err) {
        setIndexError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  // Load values whenever selection changes
  const cancelRef = useRef<(() => void) | null>(null);

  // Identifies the request the effect below will start, or null when it
  // starts none. Uses the same inputs as the effect (sel.end raw, not the
  // resolved month), so loading resets exactly when a request starts.
  const valuesRequest =
    index && metaLoaded && sel.layer === "crime" && (sel.end || availableMonths[0])
      ? `${sel.group}|${sel.period}|${sel.end}`
      : null;
  const [prevValuesRequest, setPrevValuesRequest] = useState<string | null>(null);
  if (valuesRequest !== prevValuesRequest) {
    setPrevValuesRequest(valuesRequest);
    if (valuesRequest !== null) {
      setValuesLoading(true);
      setValuesError(null);
    }
  }

  useEffect(() => {
    if (!index || !metaLoaded) return;

    // Cancel previous request
    if (cancelRef.current) cancelRef.current();
    cancelRef.current = null;

    // Context layers colour from dim_lsoa, which is already loaded. The
    // loading overlay and error are only rendered for the crime layer.
    if (sel.layer !== "crime") return;

    const endMonth = sel.end || availableMonths[0];
    if (!endMonth) return;

    let cancelled = false;
    cancelRef.current = () => { cancelled = true; };

    const windowMonths = sel.period === "1m" ? 1 : 12;

    (async () => {
      const sql = buildValuesQuery(index, endMonth, windowMonths, sel.group);
      const rows = await query<MapValueRow>(sql);
      if (cancelled) return;
      setValues(rows);
      setValuesLoading(false);
    })().catch((err: unknown) => {
      if (!cancelled) {
        setValuesError(err instanceof Error ? err.message : String(err));
        setValuesLoading(false);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, metaLoaded, sel.layer, sel.group, sel.period, sel.end]);

  const endMonth = sel.end || availableMonths[0] || "";
  const windowMonths = sel.period === "1m" ? 1 : 12;

  const classification = useMemo(() => {
    if (values.length === 0) return { breaks: [], lowPopColor: "#ccc" };
    const isRate = sel.measure === "rate";
    const usable = isRate
      ? values.filter((v) => !v.low_pop && v.per_1000 != null).map((v) => v.per_1000!)
      : values.map((v) => v.n);
    return classify(usable, dark);
  }, [values, sel.measure, dark]);

  const contextLayer: ContextLayer | null = sel.layer === "crime" ? null : sel.layer;

  const fixed = useMemo(() => {
    if (!contextLayer) return null;
    const { edges, ...opts } = CONTEXT[contextLayer].preset;
    return fixedClasses(edges, dark, opts);
  }, [contextLayer, dark]);

  const contextInfo = useMemo(() => {
    if (!contextLayer || dim.size === 0) return null;
    let hasNull = false;
    for (const d of dim.values()) {
      if (contextValue(d, contextLayer) == null) { hasNull = true; break; }
    }
    return { hasNull, summary: contextSummary(contextLayer, dim) };
  }, [contextLayer, dim]);

  const windowLabel = useMemo(() => {
    if (!endMonth) return "";
    const end = formatMonth(endMonth);
    return sel.period === "12m" ? `12 months to ${end}` : end;
  }, [endMonth, sel.period]);

  const ariaLabel = useMemo(() => {
    const groupLabel = sel.group === "all"
      ? "all crime excl. ASB"
      : sel.group === "asb"
      ? "anti-social behaviour"
      : sel.group;
    const measureLabel = sel.measure === "rate" ? "per 1,000 residents" : "count";
    if (contextLayer) return CONTEXT[contextLayer].ariaLabel;
    return `LSOA crime map: ${groupLabel}, ${measureLabel}, ${windowLabel}`;
  }, [sel, windowLabel, contextLayer]);

  if (indexError) return <InlineError message={indexError} />;

  const controlClass = "rounded border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--fg)] px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chart-1)]";

  const relevantIssues = issues.filter((iss) => {
    if (iss.issue_type !== "coverage gap") return false;
    const windowStart = (() => {
      const [ey, em] = endMonth.split("-").map(Number);
      const d = new Date(ey, em - 1 - windowMonths, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    })();
    const gapStart = iss.start_month.slice(0, 7);
    const gapEnd = iss.end_month ? iss.end_month.slice(0, 7) : "9999-99";
    return gapStart <= endMonth && gapEnd > windowStart;
  }).filter((iss) =>
    sel.group === "all" || sel.group === iss.scope || sel.group.toLowerCase() === iss.scope.toLowerCase()
  );

  return (
    <main
      className="mx-auto max-w-5xl px-4 py-6 w-full"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
          {(contextLayer ? CONTEXT[contextLayer] : CRIME_HEADING).title}
        </h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          {(contextLayer ? CONTEXT[contextLayer] : CRIME_HEADING).subtitle}
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        {/* Layer */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--fg-muted)]" htmlFor="map-layer">Show</label>
          <select
            id="map-layer"
            className={controlClass}
            value={sel.layer}
            onChange={(e) => setParam("layer", e.target.value)}
          >
            {LAYERS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        {sel.layer === "crime" && (<>
        {/* Crime group */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-[var(--fg-muted)]" htmlFor="map-group">Crime group</label>
          {!metaLoaded ? (
            <Skeleton className="h-9 w-48" />
          ) : (
            <select
              id="map-group"
              className={controlClass}
              value={sel.group}
              onChange={(e) => setParam("group", e.target.value)}
            >
              <option value="all">All crime (excl. ASB)</option>
              {crimeGroups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option value="asb">Anti-social behaviour</option>
            </select>
          )}
        </div>

        {/* Period */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--fg-muted)]" htmlFor="map-period">Period</label>
          <select
            id="map-period"
            className={controlClass}
            value={sel.period}
            onChange={(e) => setParam("period", e.target.value)}
          >
            <option value="12m">12 months</option>
            <option value="1m">Single month</option>
          </select>
        </div>

        {/* Ending month */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-[var(--fg-muted)]" htmlFor="map-end">Ending month</label>
          {!metaLoaded ? (
            <Skeleton className="h-9 w-36" />
          ) : (
            <select
              id="map-end"
              className={controlClass}
              value={sel.end || availableMonths[0]}
              onChange={(e) => setParam("end", e.target.value)}
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>{formatMonth(m)}</option>
              ))}
            </select>
          )}
        </div>

        {/* Measure */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--fg-muted)]" htmlFor="map-measure">Measure</label>
          <select
            id="map-measure"
            className={controlClass}
            value={sel.measure}
            onChange={(e) => setParam("measure", e.target.value)}
          >
            <option value="rate">Per 1,000 residents</option>
            <option value="count">Count</option>
          </select>
        </div>
        </>)}
      </div>

      {/* Context layer caveat */}
      {contextLayer && (
        <p className="mb-4 text-xs text-[var(--fg-muted)]">{CONTEXT[contextLayer].caveat}</p>
      )}

      {/* Coverage gap notice */}
      {sel.layer === "crime" && relevantIssues.length > 0 && endMonth && (
        <CoverageNotice
          issues={issues}
          group={sel.group}
          endMonth={endMonth}
          windowMonths={windowMonths}
        />
      )}

      {/* Map + legend */}
      <SectionBoundary>
      <div className="relative">
        {sel.layer === "crime" && valuesError && <InlineError message={valuesError} />}

        {/* Map skeleton */}
        {!metaLoaded && (
          <div
            className="animate-pulse rounded bg-[var(--skeleton)] w-full"
            style={{ height: "520px" }}
            aria-hidden="true"
          />
        )}

        {metaLoaded && (
          <div className="relative">
            {sel.layer === "crime" && valuesLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-[var(--bg)]/60 pointer-events-none">
                <span className="text-sm text-[var(--fg-muted)]">Loading…</span>
              </div>
            )}
            <LsoaMap
              layer={sel.layer}
              values={values}
              dim={dim}
              breaks={classification.breaks}
              lowPopColor={classification.lowPopColor}
              measure={sel.measure}
              fixed={fixed}
              ariaLabel={ariaLabel}
              dark={dark}
            />
          </div>
        )}

        {/* Legend — absolute on desktop, below on mobile */}
        {metaLoaded && contextLayer && fixed && (
          <div className="mt-3 md:mt-0 md:absolute md:bottom-3 md:left-3 md:max-w-[200px]">
            <FixedLegend
              title={CONTEXT[contextLayer].legendTitle}
              breaks={fixed.breaks}
              noDataColor={fixed.noDataColor}
              showNoData={contextInfo?.hasNull ?? false}
              ends={CONTEXT[contextLayer].legendEnds}
            />
          </div>
        )}
        {metaLoaded && !contextLayer && classification.breaks.length > 0 && (
          <div className="mt-3 md:mt-0 md:absolute md:bottom-3 md:left-3 md:max-w-[200px]">
            <MapLegend
              breaks={classification.breaks}
              lowPopColor={classification.lowPopColor}
              measure={sel.measure}
              showLowPop={sel.measure === "rate"}
              windowLabel={windowLabel}
            />
          </div>
        )}
      </div>
      </SectionBoundary>

      {/* Crime rate by band of the context layer; the chart has its own SectionBoundary */}
      {contextLayer && (
        <div className="mt-6">
          <p className="mb-2 text-sm text-[var(--fg-muted)]">
            Crime rate by band of the layer above (12 months; excludes ASB and crime groups with a police.uk coverage gap).
          </p>
          <BinnedRateChart factor={contextLayer} compact />
        </div>
      )}

      {/* Top 10 */}
      <SectionBoundary>
      {sel.layer === "crime" && values.length > 0 && (
        <Top10 values={values} dim={dim} measure={sel.measure} />
      )}
      {contextInfo?.summary && (
        <p className="mt-6 text-sm text-[var(--fg)]">{contextInfo.summary}</p>
      )}
      </SectionBoundary>
    </main>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={
      <main className="mx-auto max-w-5xl px-4 py-6 w-full">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-[var(--skeleton)]" />
          <div className="h-4 w-64 rounded bg-[var(--skeleton)]" />
          <div className="h-9 w-full rounded bg-[var(--skeleton)]" style={{ maxWidth: 600 }} />
          <div className="h-[520px] w-full rounded bg-[var(--skeleton)]" />
        </div>
      </main>
    }>
      <MapPageInner />
    </Suspense>
  );
}
