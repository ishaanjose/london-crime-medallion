"use client";

import { useQuery } from "@/lib/useQuery";
import { parquet } from "@/lib/query";
import { formatMonth } from "@/lib/format";

type FreshnessRow = {
  source: string;
  dataset: string;
  latest_version: string | null;
  last_ingested_at: string | null;
  ingestions: number;
  data_from: string | null;
  data_to: string | null;
};

function relTime(isoStr: string | null): { rel: string; full: string } | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  const p = (n: number, unit: string) => `${n} ${n === 1 ? unit : unit + "s"} ago`;
  let rel: string;
  if (diff < 60) rel = "just now";
  else if (diff < 3600) rel = p(Math.floor(diff / 60), "min");
  else if (diff < 86400) rel = p(Math.floor(diff / 3600), "hr");
  else if (diff < 86400 * 30) rel = p(Math.floor(diff / 86400), "day");
  else if (diff < 86400 * 365) rel = `${Math.floor(diff / (86400 * 30))} mo ago`;
  else rel = `${Math.floor(diff / (86400 * 365))} yr ago`;
  const full = d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return { rel, full };
}

function dataCovers(from: string | null, to: string | null): string {
  if (!from && !to) return "Reference data";
  if (from && to) return `${formatMonth(from)} – ${formatMonth(to)}`;
  return from ? formatMonth(from) : formatMonth(to!);
}

function SkeletonRow() {
  return (
    <tr aria-hidden="true">
      {[120, 120, 80, 160, 100, 48].map((w, i) => (
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

export default function SourceFreshness() {
  const { data, error, loading } = useQuery<FreshnessRow>((index) => {
    const F = parquet(index, "rpt_source_freshness");
    return `
      select
        source,
        dataset,
        latest_version,
        strftime(last_ingested_at, '%Y-%m-%dT%H:%M:%S') as last_ingested_at,
        ingestions::integer as ingestions,
        strftime(data_from, '%Y-%m') as data_from,
        strftime(data_to, '%Y-%m') as data_to
      from ${F}
      order by source, dataset
    `;
  });

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
    <div className="overflow-x-auto rounded border border-[var(--border)]">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className={thCls}>Source</th>
            <th className={thCls}>Dataset</th>
            <th className={thCls}>Version</th>
            <th className={thCls}>Data covers</th>
            <th className={thCls}>Last ingested</th>
            <th className={`${thCls} text-right`}>Ingestions</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
            : data?.map((row, i) => {
                const rt = relTime(row.last_ingested_at);
                return (
                  <tr
                    key={i}
                    className="border-t border-[var(--border)] hover:bg-[var(--surface)] transition-colors"
                  >
                    <td className={`${tdCls} font-mono text-xs`}>{row.source}</td>
                    <td className={tdCls}>{row.dataset}</td>
                    <td className={`${tdCls} font-mono text-xs text-[var(--fg-muted)]`}>
                      {row.latest_version ?? "—"}
                    </td>
                    <td className={tdCls}>{dataCovers(row.data_from, row.data_to)}</td>
                    <td
                      className={`${tdCls} text-[var(--fg-muted)]`}
                      title={rt?.full}
                    >
                      {rt?.rel ?? "—"}
                    </td>
                    <td className={`${tdCls} text-right tabular-nums`}>
                      {row.ingestions}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
