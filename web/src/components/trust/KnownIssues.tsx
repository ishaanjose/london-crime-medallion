"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";
import { formatMonth } from "@/lib/format";

type IssueRow = {
  issue_type: string;
  source: string;
  scope: string;
  start_month: string | null;
  end_month: string | null;
  severity: string | null;
  description: string;
  handling: string;
};

type LatestRow = { max_data_to: string | null };

function formatIssueType(type: string): string {
  return type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start && !end) return "Not time-bound";
  if (!start) return `Until ${formatMonth(end)}`;
  if (!end) return `${formatMonth(start)} – ongoing`;
  if (start === end) return formatMonth(start);
  return `${formatMonth(start)} – ${formatMonth(end)}`;
}

function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      {[80, 120, 140, 60, 180, 160].map((w, i) => (
        <td key={i} className="px-3 py-2.5">
          <div
            className="h-3.5 rounded animate-pulse bg-[var(--skeleton)]"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

export default function KnownIssues() {
  const [showAll, setShowAll] = useState(true);

  const { data, error, loading } = useQuery<IssueRow>((index) => {
    const KI = parquet(index, "rpt_known_issues");
    return `
      select
        issue_type,
        source,
        scope,
        strftime(start_month, '%Y-%m') as start_month,
        strftime(end_month, '%Y-%m') as end_month,
        severity,
        description,
        handling
      from ${KI}
      order by start_month desc nulls last
    `;
  });

  const { data: latestData } = useQuery<LatestRow>((index) => {
    const F = parquet(index, "rpt_source_freshness");
    return `
      select strftime(max(data_to), '%Y-%m') as max_data_to
      from ${F}
      where data_to is not null
    `;
  });

  const latestDataMonth = latestData?.[0]?.max_data_to ?? null;

  const rows = useMemo(() => {
    if (!data) return [];
    if (showAll) return data;
    return data.filter(
      (r) =>
        r.end_month === null ||
        (latestDataMonth !== null && r.end_month >= latestDataMonth),
    );
  }, [data, showAll, latestDataMonth]);

  if (error) {
    return (
      <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
        {error}
      </pre>
    );
  }

  const thCls =
    "text-xs font-medium text-[var(--fg-muted)] text-left px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]";
  const tdCls = "px-3 py-2.5";

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="group" aria-label="Filter issues">
        {(["All", "In effect now"] as const).map((label) => {
          const active = label === "All" ? showAll : !showAll;
          return (
            <button
              key={label}
              onClick={() => setShowAll(label === "All")}
              aria-pressed={active}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                active
                  ? "border-[var(--chart-1)] text-[var(--chart-1)] font-semibold bg-[var(--chart-fill)]"
                  : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--chart-1)] hover:text-[var(--chart-1)]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded border border-[var(--border)]">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Type</th>
              <th className={thCls}>Scope</th>
              <th className={thCls}>Period</th>
              <th className={thCls}>Severity</th>
              <th className={thCls}>What happened</th>
              <th className={thCls}>How it’s handled</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => <SkeletonRow key={i} />)
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-sm text-[var(--fg-muted)]"
                >
                  No issues currently in effect
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-t border-[var(--border)] hover:bg-[var(--surface)] transition-colors"
                >
                  <td className={tdCls}>
                    {formatIssueType(row.issue_type)}
                  </td>
                  <td className={tdCls}>{row.scope}</td>
                  <td
                    className={`${tdCls} tabular-nums whitespace-nowrap text-[var(--fg-muted)]`}
                  >
                    {formatPeriod(row.start_month, row.end_month)}
                  </td>
                  <td className={`${tdCls} text-[var(--fg-muted)]`}>
                    {row.severity ?? ""}
                  </td>
                  <td className={`${tdCls} max-w-[280px]`}>{row.description}</td>
                  <td
                    className={`${tdCls} max-w-[220px] text-[var(--fg-muted)]`}
                  >
                    {row.handling}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <dl
        aria-label="Terms used above"
        className="max-w-prose space-y-2 text-xs text-[var(--fg-muted)]"
      >
        <div>
          <dt className="inline font-medium text-[var(--fg)]">Charged: </dt>
          <dd className="inline">
            police.uk records a police outcome of “Suspect charged” or “Suspect
            charged as part of another case” for the crime. Charge rates only
            count a charge recorded within 12 months of the month of the crime.
          </dd>
        </div>
        <div>
          <dt className="inline font-medium text-[var(--fg)]">Mature: </dt>
          <dd className="inline">
            a month of crimes is mature once the published outcomes reach at
            least 12 months past it. Charge rates and the outcome mix only use
            mature months, because newer crimes have not had time to be charged.
          </dd>
        </div>
      </dl>
    </div>
  );
}
