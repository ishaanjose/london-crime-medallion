// Single source of truth for chart series colours.
// Use CSS variable strings so components stay theme-aware without extra logic.
// Define the actual values in globals.css.

export const chart = {
  crimes: "var(--chart-1)",
  avg12m:  "var(--chart-2)",
  fill:    "var(--chart-fill)",
  grid:    "var(--chart-grid)",
  axis:    "var(--chart-axis)",
  bar:     "var(--chart-1)",
} as const;

export type ChartKey = keyof typeof chart;
