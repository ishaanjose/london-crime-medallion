"use client";

import { useQuery } from "@/lib/useQuery";
import { formatMonth } from "@/lib/format";
import {
  areaHeadline, areaRankLine, buildAreaSummarySql, buildNearestPointsSql,
  type AreaSummaryRow, type NearestPointsRow,
} from "@/lib/area";
import { parkLabel } from "@/lib/parkLabel";
import KpiCard from "@/components/KpiCard";
import SectionBoundary from "@/components/SectionBoundary";

type Props = { postcode: string; lsoa: string; latitude: number; longitude: number };

const fmt1 = (v: number) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (v: number) => v.toLocaleString("en-GB");
const fmtM = (v: number | null) => (v == null ? "No data" : `${fmtInt(v)} m`);
const decile = (v: number | null) => (v == null ? "No data" : `${v} of 10`);

// More than 3 times the median London LSOA: likely a visitor-heavy area.
const INFLATED_RATIO = 3;
function isInflated(r: AreaSummaryRow): boolean {
  return (
    r.rate_per_1000 != null &&
    r.london_median != null &&
    r.london_median > 0 &&
    r.rate_per_1000 > INFLATED_RATIO * r.london_median
  );
}

function formatPostcode(key: string): string {
  return `${key.slice(0, -3)} ${key.slice(-3)}`;
}

function Skeleton() {
  return (
    <div aria-hidden="true">
      <div className="animate-pulse space-y-2">
        <div className="h-7 w-64 max-w-full rounded bg-[var(--skeleton)]" />
        <div className="h-4 w-48 rounded bg-[var(--skeleton)]" />
        <div className="h-5 w-full max-w-prose rounded bg-[var(--skeleton)] mt-4" />
        <div className="h-5 w-3/4 max-w-prose rounded bg-[var(--skeleton)]" />
      </div>
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiCard key={i} loading />
        ))}
      </div>
    </div>
  );
}

// The two distance cards: from the postcode, not the LSOA centre. Their query
// fails independently of the summary, so a failure stays inside the cards.
function NearestCards({ latitude, longitude }: { latitude: number; longitude: number }) {
  const { data, error, loading } = useQuery<NearestPointsRow>((index) =>
    buildNearestPointsSql(index, latitude, longitude),
  );

  if (error) {
    return (
      <div className="col-span-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-xs text-red-700 dark:text-red-300">
        Nearest station and park couldn’t be worked out: {error}
      </div>
    );
  }
  if (loading || !data) {
    return (
      <>
        <KpiCard loading />
        <KpiCard loading />
      </>
    );
  }
  const r = data[0];
  return (
    <>
      <KpiCard
        label="Nearest station"
        value={fmtM(r?.station_m ?? null)}
        sublabel={r?.station_name ?? undefined}
      />
      <KpiCard
        label="Nearest park entrance"
        value={fmtM(r?.park_m ?? null)}
        sublabel={parkLabel(r?.park_name, r?.park_function) ?? undefined}
      />
    </>
  );
}

function Summary({ postcode, lsoa, latitude, longitude }: Props) {
  const { data, error, loading } = useQuery<AreaSummaryRow>((index) =>
    buildAreaSummarySql(index, lsoa),
  );

  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  const r = data[0];
  if (!r) throw new Error(`No population or crime data for LSOA ${lsoa}.`);

  const rank = areaRankLine(r);
  const period = `12 months to ${formatMonth(r.latest_month)}`;

  return (
    <div>
      <header>
        <p className="text-sm text-[var(--fg-muted)]">{formatPostcode(postcode)} is in</p>
        <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-[var(--fg)]">
          LSOA {r.lsoa21_code}
          {r.borough_name && (
            <span className="font-normal text-[var(--fg-muted)]">, {r.borough_name}</span>
          )}
        </h2>
        {r.lsoa21_name && (
          <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{r.lsoa21_name}</p>
        )}
      </header>

      {r.low_pop && (
        <p
          role="note"
          className="mt-4 max-w-prose rounded-md border border-[var(--border)] bg-[var(--impaired)] px-3 py-2 text-sm text-[var(--fg)]"
        >
          Few residents live here
          {r.pop != null ? ` (${fmtInt(r.pop)})` : ""}, so a handful of crimes moves the
          rate a lot. This area is left out of the London comparisons on other pages.
        </p>
      )}

      <p className="mt-4 max-w-prose text-base text-[var(--fg)]">
        {areaHeadline(r)}
        {rank && ` ${rank}`}
      </p>
      {isInflated(r) && (
        <p
          role="note"
          className="mt-3 max-w-prose rounded-md border border-[var(--border)] bg-[var(--impaired)] px-3 py-2 text-sm text-[var(--fg)]"
        >
          Rates divide by resident population. Busy commercial and transport areas have
          few residents but many visitors, so their rates look inflated.
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Crimes per 1,000 residents"
          value={r.rate_per_1000 == null ? "No data" : fmt1(r.rate_per_1000)}
          sublabel={`${fmtInt(r.crimes)} crimes, ${period}`}
        />
        <KpiCard
          label="IMD 2025 decile"
          value={decile(r.imd_decile_2025)}
          sublabel="1 = most deprived"
        />
        <KpiCard
          label="Income deprivation decile"
          value={decile(r.income_decile_2025)}
          sublabel="1 = most deprived"
        />
        <NearestCards latitude={latitude} longitude={longitude} />
      </div>
      <p className="mt-2 text-xs text-[var(--fg-muted)]">
        Station and park distances are straight-line from this postcode, not walking
        routes. Crime counts exclude anti-social behaviour
        {r.excluded_groups ? ` and ${r.excluded_groups} (police.uk coverage gap)` : ""}.
      </p>
    </div>
  );
}

export default function AreaSummary(props: Props) {
  return (
    <SectionBoundary>
      <Summary {...props} />
    </SectionBoundary>
  );
}
