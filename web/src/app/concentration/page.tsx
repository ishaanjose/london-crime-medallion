"use client";

import { useState } from "react";
import { useQuery } from "@/lib/useQuery";
import {
  EXCLUSION_FALLBACK, LEVELS, POINT_REPLACED_REASON, aboutCount, buildGapGroupsSql, buildSummarySql,
  exclusionCaveat, exclusionSublabel, fmtGini, fmtInt, headline,
  type GapGroupRow, type Level, type SummaryRow,
} from "@/lib/concentration";
import KpiCard from "@/components/KpiCard";
import DataStamp from "@/components/DataStamp";
import SectionBoundary from "@/components/SectionBoundary";
import LorenzChart from "@/components/concentration/LorenzChart";
import ConcentrationTrend from "@/components/concentration/ConcentrationTrend";

function SectionHeader({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-muted)] mb-4"
    >
      {children}
    </h2>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
      {message}
    </pre>
  );
}

const selectClass =
  "mt-1 block w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--fg)] disabled:opacity-60";

// The first caveat is built from the gap registry; see exclusionCaveat.
const CAVEATS = [
  "Full calendar years only. 2026 is not complete yet, so the latest year shown is 2025.",
  "Street points only include points with at least one crime that year, because police.uk never publishes empty points. That understates how concentrated crime is at street level.",
  "police.uk replaced its map-point set in December 2011 and July 2022, so in those years one street can count as two points. Street points are left out for 2011 and 2022.",
];

function Tiles({ row, gapGroups }: { row: SummaryRow | undefined; gapGroups: string[] | null }) {
  if (!row) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
        {[0, 1, 2, 3].map((i) => <KpiCard key={i} loading />)}
      </div>
    );
  }
  const { plural } = LEVELS[row.place_level];
  const count = aboutCount((row.n_places * row.pct_places_for_half_of_crime) / 100);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
      <KpiCard
        label="Share of places for half of crime"
        value={`${row.pct_places_for_half_of_crime}%`}
        sublabel={`About ${fmtInt(count)} ${plural}`}
      />
      <KpiCard
        label="Gini"
        value={fmtGini(row.gini)}
        sublabel="0 is an even spread, 1 is all in one place"
      />
      <KpiCard
        label="Total crimes"
        value={fmtInt(row.total_crimes)}
        sublabel={gapGroups ? exclusionSublabel(gapGroups) : "Excludes ASB and crime groups with a police.uk coverage gap"}
      />
      <KpiCard
        label="Number of places"
        value={fmtInt(row.n_places)}
        sublabel={row.place_level === "point" ? "Street points with at least one crime" : "All LSOAs in London"}
      />
    </div>
  );
}

export default function ConcentrationPage() {
  const summary = useQuery<SummaryRow>(buildSummarySql);
  const gaps = useQuery<GapGroupRow>(buildGapGroupsSql);
  const gapGroups = gaps.data ? gaps.data.map((g) => g.crime_group) : null;
  const rows = summary.data ?? [];
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const [level, setLevel] = useState<Level>("lsoa");

  // Latest full year until the reader picks one.
  const year = pickedYear ?? years[0] ?? null;
  const row = rows.find((r) => r.year === year && r.place_level === level);
  const ready = summary.data != null && year != null;
  const notComparable = ready && !row && level === "point";

  return (
    <main
      className="mx-auto max-w-5xl w-full px-4 py-10"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
          Crime concentration
        </h1>
        <p className="mt-1 max-w-prose text-sm text-[var(--fg-muted)]">
          Some places account for far more crime than others, and this shows how much.
        </p>
      </header>

      <section className="mb-8" aria-label="Filters">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="text-xs text-[var(--fg-muted)] sm:w-40">
            Year
            <select
              className={selectClass}
              value={year ?? ""}
              disabled={!ready}
              onChange={(e) => setPickedYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <div className="text-xs text-[var(--fg-muted)]">
            <span id="level-label" className="block">Place level</span>
            <div
              role="group"
              aria-labelledby="level-label"
              className="mt-1 inline-flex rounded border border-[var(--border)] p-0.5"
            >
              {(Object.keys(LEVELS) as Level[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={level === l}
                  onClick={() => setLevel(l)}
                  className={`rounded px-3 py-1.5 text-sm transition-colors ${
                    level === l
                      ? "bg-[var(--surface)] font-medium text-[var(--fg)] shadow-sm"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {LEVELS[l].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {summary.error ? (
        <div className="mb-12"><ErrorBox message={summary.error} /></div>
      ) : notComparable ? (
        <section className="mb-12" aria-label="Street points not available">
          <p className="max-w-prose rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--fg)]">
            {POINT_REPLACED_REASON}
          </p>
        </section>
      ) : (
        <>
          <section className="mb-8" aria-label="Headline">
            <SectionBoundary>
              {row ? (
                <>
                  <p className="max-w-prose text-lg text-[var(--fg)]">{headline(row)}</p>
                  {level === "point" && (
                    <p className="mt-1 max-w-prose text-sm text-[var(--fg-muted)]">
                      Points with no crime are never published, so this understates how
                      concentrated crime is.
                    </p>
                  )}
                </>
              ) : (
                <div className="h-6 w-full max-w-prose animate-pulse rounded bg-[var(--skeleton)]" aria-hidden="true" />
              )}
              <div className="mt-4">
                <Tiles row={row} gapGroups={gapGroups} />
              </div>
            </SectionBoundary>
          </section>

          <section className="mb-12" aria-labelledby="concentration-curve">
            <SectionHeader id="concentration-curve">How crime adds up across places</SectionHeader>
            <SectionBoundary key={`${year}-${level}`}>
              {ready ? (
                <LorenzChart year={year} level={level} />
              ) : (
                <div className="h-[300px] animate-pulse rounded bg-[var(--skeleton)]" aria-hidden="true" />
              )}
            </SectionBoundary>
          </section>
        </>
      )}

      <section className="mb-12" aria-labelledby="concentration-trend">
        <SectionHeader id="concentration-trend">Over time</SectionHeader>
        <SectionBoundary>
          {summary.data ? (
            <ConcentrationTrend rows={summary.data} />
          ) : summary.error ? null : (
            <div className="h-[260px] animate-pulse rounded bg-[var(--skeleton)]" aria-hidden="true" />
          )}
        </SectionBoundary>
      </section>

      <aside
        aria-label="Caveats"
        className="mb-10 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <h2 className="text-sm font-medium text-[var(--fg)]">Read these first</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--fg-muted)]">
          <li>
            {gapGroups ? exclusionCaveat(gapGroups) : gaps.loading ? (
              <span className="inline-block h-3.5 w-full max-w-md animate-pulse rounded bg-[var(--skeleton)] align-middle" aria-hidden="true" />
            ) : EXCLUSION_FALLBACK}
          </li>
          {CAVEATS.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </aside>

      <DataStamp />
    </main>
  );
}
