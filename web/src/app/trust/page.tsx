"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dataUrl, loadIndex } from "@/lib/data";
import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";
import SourceFreshness from "@/components/trust/SourceFreshness";
import Reconciliation from "@/components/trust/Reconciliation";
import KnownIssues from "@/components/trust/KnownIssues";
import TestResults from "@/components/trust/TestResults";
import Lineage from "@/components/trust/Lineage";
import SectionBoundary from "@/components/SectionBoundary";

type HeaderData = {
  built_at: string;
  git_commit: string;
  pass_count: number;
  hasNonPassing: boolean;
};

type IssueCountRow = { cnt: number };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-muted)] mb-4">
      {children}
    </h2>
  );
}

export default function TrustPage() {
  const [header, setHeader] = useState<HeaderData | null>(null);

  useEffect(() => {
    Promise.all([
      loadIndex(),
      fetch(dataUrl("tests.json")).then((r) => {
        if (!r.ok) throw new Error(`tests.json: ${r.status}`);
        return r.json() as Promise<{
          counts: Record<string, number>;
          tests: { status: string }[];
        }>;
      }),
    ])
      .then(([idx, testsJson]) => {
        setHeader({
          built_at: idx.built_at,
          git_commit: idx.git_commit,
          pass_count: testsJson.counts.pass ?? 0,
          hasNonPassing: testsJson.tests.some((t) => t.status !== "pass"),
        });
      })
      .catch(console.error);
  }, []);

  const issueCount = useQuery<IssueCountRow>((index) => {
    const F = parquet(index, "rpt_source_freshness");
    const KI = parquet(index, "rpt_known_issues");
    return `
      select count(*)::integer as cnt
      from ${KI}
      where end_month is null
         or end_month >= (
           select coalesce(max(data_to), date '1900-01-01')
           from ${F}
           where data_to is not null
         )
    `;
  });

  const cnt = issueCount.data?.[0]?.cnt;

  const summaryParts: string[] = [];
  if (header) {
    summaryParts.push(
      `${header.pass_count.toLocaleString("en-GB")} tests passing`,
    );
    if (cnt !== undefined) {
      summaryParts.push(`${cnt} issue${cnt === 1 ? "" : "s"} in effect`);
    }
    summaryParts.push(
      `built ${fmtDate(header.built_at)} from commit ${header.git_commit.slice(0, 7)}`,
    );
  }

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
          Data trust
        </h1>
        {header ? (
          <>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              {summaryParts.join(" · ")}
            </p>
            {header.hasNonPassing && (
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                Some tests are not passing.{" "}
                <Link href="#tests" className="underline">
                  View test results ↓
                </Link>
              </p>
            )}
          </>
        ) : (
          <div
            className="mt-1 h-4 w-80 rounded animate-pulse bg-[var(--skeleton)]"
            aria-hidden="true"
          />
        )}
      </header>

      <section className="mb-10" aria-label="Source freshness">
        <SectionHeader>Source freshness</SectionHeader>
        <SectionBoundary><SourceFreshness /></SectionBoundary>
      </section>

      <section className="mb-10" aria-label="Reconciliation">
        <SectionHeader>Reconciliation: police.uk vs Met datastore</SectionHeader>
        <SectionBoundary><Reconciliation /></SectionBoundary>
      </section>

      <section className="mb-10" aria-label="Known issues">
        <SectionHeader>Known issues</SectionHeader>
        <SectionBoundary><KnownIssues /></SectionBoundary>
      </section>

      <section className="mb-10" id="tests" aria-label="Test results">
        <SectionHeader>Test results</SectionHeader>
        <SectionBoundary><TestResults /></SectionBoundary>
      </section>

      <section className="mb-10" aria-label="Data lineage">
        <SectionHeader>Data lineage</SectionHeader>
        <SectionBoundary><Lineage /></SectionBoundary>
      </section>
    </main>
  );
}
