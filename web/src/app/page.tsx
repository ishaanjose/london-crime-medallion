"use client";

import { useEffect, useState } from "react";
import { getDb } from "@/lib/duckdb";
import { dataUrl, loadIndex, type ExportIndex } from "@/lib/data";

type Summary = { months: number; crimes: number; latest: string };

export default function Home() {
  const [index, setIndex] = useState<ExportIndex | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const idx = await loadIndex();
      if (cancelled) return;
      setIndex(idx);

      const db = await getDb();
      const conn = await db.connect();
      try {
        const url = dataUrl("fct_police_uk_london_month.parquet");
        const result = await conn.query(`
          select count(*)::int as months,
                 sum(crime_count)::double as crimes,
                 strftime(max(month), '%Y-%m') as latest
          from read_parquet('${url}')
        `);
        const row = result.toArray()[0].toJSON();
        if (!cancelled) {
          setSummary({
            months: Number(row.months),
            crimes: Number(row.crimes),
            latest: String(row.latest),
          });
        }
      } finally {
        await conn.close();
      }
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-xl p-8 font-mono text-sm">
      <h1 className="mb-6 text-lg font-semibold">Export check</h1>

      {error && (
        <pre className="mb-6 whitespace-pre-wrap rounded border border-red-400 bg-red-50 p-3 text-red-800">
          {error}
        </pre>
      )}

      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
        <dt>built_at</dt>
        <dd>{index?.built_at ?? "…"}</dd>
        <dt>git_commit</dt>
        <dd>
          {index ? `${index.git_commit.slice(0, 7)}${index.git_dirty ? " (dirty)" : ""}` : "…"}
        </dd>
        <dt>files</dt>
        <dd>{index?.files.length ?? "…"}</dd>
        <dt>months</dt>
        <dd>{summary?.months ?? "…"}</dd>
        <dt>crimes</dt>
        <dd>{summary ? summary.crimes.toLocaleString("en-GB") : "…"}</dd>
        <dt>latest</dt>
        <dd>{summary?.latest ?? "…"}</dd>
      </dl>
    </main>
  );
}
