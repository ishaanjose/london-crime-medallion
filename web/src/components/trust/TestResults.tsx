"use client";

import { useState, useMemo } from "react";
import { useFetch } from "@/lib/useFetch";

type TestEntry = {
  name: string;
  model: string;
  status: string;
  failures: number;
  execution_time: number;
};

type TestsJson = {
  generated_at: string;
  dbt_version: string;
  counts: Record<string, number>;
  tests: TestEntry[];
};

type LineageNode = {
  id: string;
  name: string;
  resource_type: string;
  layer: string;
  materialized: string;
  test_count: number;
};

type LineageJson = {
  nodes: LineageNode[];
  edges: [string, string][];
};

type ModelGroup = {
  model: string;
  layer: string;
  tests: TestEntry[];
  hasNonPassing: boolean;
};

const LAYER_ORDER: Record<string, number> = { silver: 0, gold: 1 };

function statusBadgeCls(status: string): string {
  switch (status) {
    case "pass":
      return "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200";
    case "warn":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200";
    default:
      return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200";
  }
}

function worstStatus(tests: TestEntry[]): string {
  for (const t of tests) {
    if (t.status === "fail" || t.status === "error") return "fail";
  }
  for (const t of tests) {
    if (t.status === "warn") return "warn";
  }
  return "pass";
}

export default function TestResults() {
  const [filter, setFilter] = useState("");
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(new Set());

  const tests = useFetch<TestsJson>("tests.json");
  const lineage = useFetch<LineageJson>("lineage.json");

  const layerMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const node of lineage.data?.nodes ?? []) {
      m.set(node.name, node.layer);
    }
    return m;
  }, [lineage.data]);

  const modelGroups = useMemo<ModelGroup[]>(() => {
    if (!tests.data) return [];
    const byModel = new Map<string, TestEntry[]>();
    for (const t of tests.data.tests) {
      const arr = byModel.get(t.model) ?? [];
      arr.push(t);
      byModel.set(t.model, arr);
    }
    return Array.from(byModel.entries()).map(([model, entries]) => ({
      model,
      layer: layerMap.get(model) ?? "—",
      tests: entries,
      hasNonPassing: entries.some((t) => t.status !== "pass"),
    }));
  }, [tests.data, layerMap]);

  const filteredGroups = useMemo(() => {
    const q = filter.toLowerCase();
    const groups = q
      ? modelGroups.filter(
          (g) =>
            g.model.toLowerCase().includes(q) ||
            g.tests.some((t) => t.name.toLowerCase().includes(q)),
        )
      : modelGroups;
    return [...groups].sort((a, b) => {
      if (a.hasNonPassing !== b.hasNonPassing) return a.hasNonPassing ? -1 : 1;
      const la = LAYER_ORDER[a.layer] ?? 2;
      const lb = LAYER_ORDER[b.layer] ?? 2;
      return la - lb || a.model.localeCompare(b.model);
    });
  }, [modelGroups, filter]);

  const expandedModels = useMemo(() => {
    if (filter) return new Set(filteredGroups.map((g) => g.model));
    return manualExpanded;
  }, [filter, filteredGroups, manualExpanded]);

  function toggleModel(model: string) {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  const counts = tests.data?.counts ?? {};
  const isLoading = tests.loading || lineage.loading;
  const error = tests.error ?? lineage.error;

  if (error) {
    return (
      <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
        {error}
      </pre>
    );
  }

  const thCls =
    "text-xs font-medium text-[var(--fg-muted)] text-left px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)]";

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex gap-2 animate-pulse" aria-hidden="true">
          <div className="h-6 w-20 rounded-full bg-[var(--skeleton)]" />
          <div className="h-6 w-20 rounded-full bg-[var(--skeleton)]" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(([status, count]) => (
            <span
              key={status}
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusBadgeCls(status)}`}
            >
              {status}: {count}
            </span>
          ))}
        </div>
      )}

      <input
        type="search"
        placeholder="Filter by model or test name…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full max-w-xs text-sm rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--fg)] px-3 py-1.5 placeholder:text-[var(--fg-muted)]"
        aria-label="Filter tests"
      />

      <div className="overflow-x-auto rounded border border-[var(--border)]">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={thCls}>Model</th>
              <th className={thCls}>Layer</th>
              <th className={`${thCls} text-right`}>Tests</th>
              <th className={thCls}>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} aria-hidden="true">
                    {[200, 60, 40, 60].map((w, j) => (
                      <td key={j} className="px-3 py-2.5">
                        <div
                          className="h-3.5 rounded animate-pulse bg-[var(--skeleton)]"
                          style={{ width: w }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : filteredGroups.flatMap((g) => {
                  const expanded = expandedModels.has(g.model);
                  const q = filter.toLowerCase();
                  const ws = worstStatus(g.tests);
                  const rows = [];

                  rows.push(
                    <tr
                      key={g.model}
                      className="border-t border-[var(--border)] hover:bg-[var(--surface)] transition-colors cursor-pointer select-none"
                      onClick={() => !filter && toggleModel(g.model)}
                      aria-expanded={expanded}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <span className="mr-1 text-[var(--fg-muted)]">
                          {expanded ? "▾" : "▸"}
                        </span>
                        {g.model}
                      </td>
                      <td className="px-3 py-2.5 text-[var(--fg-muted)]">
                        {g.layer}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {g.tests.length}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeCls(ws)}`}
                        >
                          {ws}
                        </span>
                      </td>
                    </tr>,
                  );

                  if (expanded) {
                    const visibleTests = q
                      ? g.tests.filter(
                          (t) =>
                            g.model.toLowerCase().includes(q) ||
                            t.name.toLowerCase().includes(q),
                        )
                      : g.tests;
                    for (const t of visibleTests) {
                      rows.push(
                        <tr
                          key={`${g.model}::${t.name}`}
                          className="border-t border-[var(--border)] bg-[var(--surface)]"
                        >
                          <td
                            className="px-3 py-1.5 pl-8 font-mono text-xs text-[var(--fg-muted)] max-w-xs overflow-hidden"
                            title={t.name}
                          >
                            <span className="block truncate">{t.name}</span>
                          </td>
                          <td className="px-3 py-1.5" />
                          <td className="px-3 py-1.5 text-right tabular-nums text-xs text-[var(--fg-muted)]">
                            {t.failures > 0 ? `${t.failures} fail` : ""}
                          </td>
                          <td className="px-3 py-1.5">
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeCls(t.status)}`}
                            >
                              {t.status}
                            </span>
                          </td>
                        </tr>,
                      );
                    }
                  }

                  return rows;
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
