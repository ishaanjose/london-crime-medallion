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

// 7-step single-hue sequential palette for the LSOA map.
// Light: pale yellow → deep orange-red. Dark: same hue, adjusted for dark bg.
export const mapSeq = {
  light: [
    "#ffffd4",
    "#fed98e",
    "#fe9929",
    "#d95f0e",
    "#993404",
    "#6a1f04",
    "#3b0d02",
  ],
  dark: [
    "#2d1b05",
    "#5c3010",
    "#994a10",
    "#d4761a",
    "#f0a830",
    "#fad168",
    "#fff7c0",
  ],
  lowPop: {
    light: "#d1d5db",
    dark:  "#374151",
  },
} as const;

export type MapSeqPalette = typeof mapSeq;
