"use client";

import { useEffect, useState } from "react";
import { loadIndex, type ExportIndex } from "@/lib/data";
import { query } from "@/lib/query";

export function useQuery<T>(
  buildSql: (index: ExportIndex) => string,
): { data: T[] | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const index = await loadIndex();
      if (cancelled) return;
      const sql = buildSql(index);
      const rows = await query<T>(sql);
      if (!cancelled) {
        setData(rows);
        setLoading(false);
      }
    })().catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, error, loading };
}
