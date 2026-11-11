"use client";

import { useState, useMemo } from "react";
import { useFetch } from "@/lib/useFetch";

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

type Column = {
  label: string;
  nodes: LineageNode[];
};

function getReachable(
  nodeId: string,
  edges: [string, string][],
  direction: "up" | "down",
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const [from, to] of edges) {
    const key = direction === "down" ? from : to;
    const val = direction === "down" ? to : from;
    if (!adj.has(key)) adj.set(key, []);
    adj.get(key)!.push(val);
  }
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const next of adj.get(curr) ?? []) queue.push(next);
  }
  return visited;
}

function nodeLabel(node: LineageNode): string {
  if (node.resource_type !== "source") return node.name;
  const parts = node.id.split(".");
  return parts.length >= 4 ? parts.slice(2).join(".") : node.name;
}

function SkeletonColumn({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-1.5 animate-pulse" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 w-full rounded bg-[var(--skeleton)]" />
      ))}
    </div>
  );
}

export default function Lineage() {
  const { data, error, loading } = useFetch<LineageJson>("lineage.json");
  const [selected, setSelected] = useState<string | null>(null);

  const columns = useMemo<Column[]>(() => {
    if (!data) return [];
    const nodes = data.nodes;
    return [
      {
        label: "Seeds",
        nodes: nodes
          .filter((n) => n.resource_type === "seed")
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
      {
        label: "Sources",
        nodes: nodes
          .filter((n) => n.resource_type === "source")
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
      {
        label: "Silver",
        nodes: nodes
          .filter((n) => n.resource_type === "model" && n.layer === "silver")
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
      {
        label: "Gold",
        nodes: nodes
          .filter((n) => n.resource_type === "model" && n.layer === "gold")
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    ];
  }, [data]);

  const highlighted = useMemo<Set<string> | null>(() => {
    if (!selected || !data) return null;
    const up = getReachable(selected, data.edges, "up");
    const down = getReachable(selected, data.edges, "down");
    return new Set([...up, ...down]);
  }, [selected, data]);

  if (error) {
    return (
      <pre className="text-xs whitespace-pre-wrap rounded border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 p-3 text-red-700 dark:text-red-300">
        {error}
      </pre>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SkeletonColumn rows={9} />
        <SkeletonColumn rows={22} />
        <SkeletonColumn rows={18} />
        <SkeletonColumn rows={13} />
      </div>
    );
  }

  return (
    <div>
      {selected && (
        <p className="text-xs text-[var(--fg-muted)] mb-3">
          Lineage for{" "}
          <span className="font-mono font-medium text-[var(--fg)]">
            {selected.split(".").pop()}
          </span>
          .{" "}
          <button
            className="underline hover:text-[var(--fg)]"
            onClick={() => setSelected(null)}
          >
            Clear
          </button>
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col.label}>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-muted)] mb-2">
              {col.label}{" "}
              <span className="font-normal normal-case">({col.nodes.length})</span>
            </p>
            <div className="flex flex-col gap-1">
              {col.nodes.map((node) => {
                const isSelected = node.id === selected;
                const isHighlighted = highlighted?.has(node.id) ?? false;
                const isDimmed = highlighted !== null && !isHighlighted;
                return (
                  <button
                    key={node.id}
                    onClick={() =>
                      setSelected(node.id === selected ? null : node.id)
                    }
                    title={node.id}
                    className={`text-left text-xs px-2 py-1.5 rounded border transition-all ${
                      isSelected
                        ? "border-[var(--chart-1)] bg-[var(--chart-fill)] text-[var(--chart-1)] font-semibold"
                        : isHighlighted
                          ? "border-[var(--chart-2)] bg-[var(--chart-fill)] text-[var(--fg)]"
                          : isDimmed
                            ? "border-[var(--border)] text-[var(--fg-muted)] opacity-30"
                            : "border-[var(--border)] text-[var(--fg)] hover:border-[var(--chart-1)] hover:text-[var(--chart-1)]"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-1 overflow-hidden">
                      <span className="font-mono truncate" title={nodeLabel(node)}>
                        {nodeLabel(node)}
                      </span>
                      {node.test_count > 0 && (
                        <span className="font-sans text-[var(--fg-muted)] not-italic shrink-0">
                          {node.test_count}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
