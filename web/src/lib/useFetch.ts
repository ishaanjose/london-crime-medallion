"use client";

import { useEffect, useState } from "react";
import { dataUrl } from "@/lib/data";

export function useFetch<T>(path: string): {
  data: T | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(dataUrl(path))
      .then((res) => {
        if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
        return res.json() as Promise<T>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, error, loading };
}
