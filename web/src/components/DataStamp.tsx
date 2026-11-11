"use client";

import { useEffect, useState } from "react";
import { loadIndex } from "@/lib/data";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DataStamp() {
  const [stamp, setStamp] = useState<string | null>(null);

  useEffect(() => {
    loadIndex()
      .then((idx) => {
        const parts = [
          `Data built ${fmtDate(idx.built_at)}`,
          `commit ${idx.git_commit.slice(0, 7)}`,
        ];
        if (idx.git_dirty) parts.push("uncommitted changes");
        setStamp(parts.join(" · "));
      })
      .catch(() => {});
  }, []);

  if (!stamp) return null;
  return (
    <footer className="text-xs text-[var(--fg-muted)] mt-10 pt-4 border-t border-[var(--border)]">
      {stamp}
    </footer>
  );
}
