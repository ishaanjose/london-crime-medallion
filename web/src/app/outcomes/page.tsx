"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@/lib/useQuery";
import {
  buildChargeKpiSql, buildOptionsSql, fmtPct, scopeKey,
  type ChargeKpiRow, type OptionRow, type Scope,
} from "@/lib/outcomes";
import KpiCard from "@/components/KpiCard";
import DataStamp from "@/components/DataStamp";
import SectionBoundary from "@/components/SectionBoundary";
import ChargeRateTrend from "@/components/outcomes/ChargeRateTrend";
import BoroughRanking from "@/components/outcomes/BoroughRanking";
import OutcomeMix from "@/components/outcomes/OutcomeMix";

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

function KpiError({ message }: { message: string }) {
  return (
    <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
      {message}
    </pre>
  );
}

const selectClass =
  "mt-1 block w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--fg)] disabled:opacity-60";

export default function OutcomesPage() {
  const [scope, setScope] = useState<Scope>({ borough: null, group: null });

  const kpi = useQuery<ChargeKpiRow>(buildChargeKpiSql);
  const options = useQuery<OptionRow>(buildOptionsSql);

  const boroughs = options.data?.filter((o) => o.kind === "borough") ?? [];
  const groups = options.data?.filter((o) => o.kind === "group") ?? [];
  const boroughLabel = boroughs.find((b) => b.value === scope.borough)?.label ?? "London";
  const groupLabel = scope.group ?? "All crime";
  const scopeLabel = `${boroughLabel}, ${groupLabel.toLowerCase()}`;
  const key = scopeKey(scope);
  const kpiRow = kpi.data?.[0];

  return (
    <main
      className="mx-auto max-w-5xl px-4 py-10"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
      }}
    >
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)]">
          Crime outcomes
        </h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          How often recorded crimes lead to a charge, and what happens to the rest
        </p>
      </header>

      <section className="mb-8" aria-label="Key figure">
        <SectionBoundary>
          {kpi.error ? (
            <KpiError message={kpi.error} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-stretch">
              {kpi.loading || !kpiRow ? (
                <KpiCard loading />
              ) : (
                <KpiCard
                  label="London charge rate within 12 months"
                  value={fmtPct(kpiRow.charge_rate)}
                  sublabel={`Crimes from ${kpiRow.cohort_from} to ${kpiRow.cohort_to}`}
                />
              )}
            </div>
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
            Charged means charged within 12 months of the crime. Police-stage outcomes only:
            police.uk stopped publishing court outcomes after May 2019. Only crimes that can be
            linked to outcomes count; anti-social behaviour has no crime ID and is excluded.
          </li>
          <li>
            Recent months are excluded until the crime month has had a full 12 months of outcome
            data. Before that the rate reads falsely low, because recent crimes have not had time
            to be charged.
          </li>
          <li>
            Months affected by a known outcome-recording gap are excluded: their charge rates are
            flagged impaired. A month is left out if any force in the selection is affected. The
            gaps are listed under known issues on the{" "}
            <Link href="/trust" className="underline hover:text-[var(--fg)]">
              Data trust
            </Link>{" "}
            page.
          </li>
        </ul>
      </aside>

      <section className="mb-10" aria-label="Filters">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="text-xs text-[var(--fg-muted)] sm:w-64">
            Crime group
            <select
              className={selectClass}
              value={scope.group ?? ""}
              disabled={!options.data}
              onChange={(e) => setScope((s) => ({ ...s, group: e.target.value || null }))}
            >
              <option value="">All crime</option>
              {groups.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-[var(--fg-muted)] sm:w-64">
            Borough
            <select
              className={selectClass}
              value={scope.borough ?? ""}
              disabled={!options.data}
              onChange={(e) => setScope((s) => ({ ...s, borough: e.target.value || null }))}
            >
              <option value="">London</option>
              {boroughs.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </label>
        </div>
        {options.error && <p className="mt-2 text-xs text-red-700 dark:text-red-300">{options.error}</p>}
      </section>

      <section className="mb-12" aria-labelledby="outcomes-trend">
        <SectionHeader id="outcomes-trend">Charge rate over time</SectionHeader>
        {/* key: useQuery runs once per mount, so remount when the scope changes */}
        <SectionBoundary key={key}>
          <ChargeRateTrend scope={scope} label={scopeLabel} />
        </SectionBoundary>
      </section>

      <section className="mb-12" aria-labelledby="outcomes-ranking">
        <SectionHeader id="outcomes-ranking">Charge rate by borough</SectionHeader>
        <SectionBoundary key={scope.group ?? "all"}>
          <BoroughRanking
            group={scope.group}
            groupLabel={groupLabel}
            selectedBorough={scope.borough}
          />
        </SectionBoundary>
      </section>

      <section className="mb-12" aria-labelledby="outcomes-mix">
        <SectionHeader id="outcomes-mix">What happens to crimes</SectionHeader>
        <SectionBoundary key={key}>
          <OutcomeMix scope={scope} label={scopeLabel} />
        </SectionBoundary>
      </section>

      <DataStamp />
    </main>
  );
}
