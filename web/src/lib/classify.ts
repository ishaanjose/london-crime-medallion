import { mapSeq, mapSeq10, noData } from "@/lib/theme";

export type ClassBreak = {
  min: number;
  max: number;
  color: string;
};

export type Classification = {
  breaks: ClassBreak[];
  lowPopColor: string;
};

// Compute up to 7-class quantile breaks from an array of values.
// Duplicate ranges (e.g. all zeros) are merged, and the palette is spread
// evenly across however many distinct classes remain.
export function classify(values: number[], isDark: boolean): Classification {
  const palette = isDark ? mapSeq.dark : mapSeq.light;
  const lowPopColor = isDark ? mapSeq.lowPop.dark : mapSeq.lowPop.light;

  if (values.length === 0) {
    return { breaks: [], lowPopColor };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const nClasses = palette.length; // 7

  // Quantile boundaries
  const quantiles: number[] = [];
  for (let i = 0; i <= nClasses; i++) {
    const idx = (i / nClasses) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    quantiles.push(sorted[lo] * (1 - frac) + sorted[hi] * frac);
  }

  // Build raw breaks
  const rawBreaks: { min: number; max: number }[] = [];
  for (let i = 0; i < nClasses; i++) {
    rawBreaks.push({ min: quantiles[i], max: quantiles[i + 1] });
  }

  // Deduplicate: keep only breaks with distinct (min, max) pairs
  const seen = new Set<string>();
  const unique: { min: number; max: number }[] = [];
  for (const b of rawBreaks) {
    const key = `${b.min}|${b.max}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(b);
    }
  }

  // Spread palette evenly across however many distinct breaks remain
  const m = unique.length;
  const breaks: ClassBreak[] = unique.map((b, i) => ({
    min: b.min,
    max: b.max,
    color: m === 1
      ? palette[palette.length - 1]
      : palette[Math.round((i / (m - 1)) * (palette.length - 1))],
  }));

  return { breaks, lowPopColor };
}

export function classifyValue(value: number, breaks: ClassBreak[]): string {
  if (breaks.length === 0) return "#cccccc";
  for (let i = 0; i < breaks.length - 1; i++) {
    if (value <= breaks[i].max) return breaks[i].color;
  }
  return breaks[breaks.length - 1].color;
}

// ---------------------------------------------------------------------------
// Fixed-band classification
// ---------------------------------------------------------------------------

export type LabelledClassBreak = ClassBreak & { label: string };

export type FixedClassification = Classification & {
  breaks: LabelledClassBreak[];
  noDataColor: string;
  // Which side of each edge is inclusive. "upper": a value equal to an edge
  // falls in the class below it (≤250). "lower": it falls in the class above
  // it (<5, 5–10).
  closed: "upper" | "lower";
};

export type FixedClassOptions = {
  // Make low values the most intense colour (e.g. IMD decile 1 = most deprived).
  reverse?: boolean;
  // One label per class (edges.length + 1). Generated from the edges if omitted.
  labels?: string[];
  closed?: "upper" | "lower";
};

const fmt = (n: number) => n.toLocaleString("en-GB");

function defaultLabels(edges: number[], closed: "upper" | "lower", unit: string): string[] {
  const u = unit ? ` ${unit}` : "";
  const first = closed === "upper" ? `≤${fmt(edges[0])}${u}` : `<${fmt(edges[0])}${u}`;
  const middle = edges.slice(1).map((e, i) => `${fmt(edges[i])}–${fmt(e)}${u}`);
  const last = closed === "upper"
    ? `>${fmt(edges[edges.length - 1])}${u}`
    : `${fmt(edges[edges.length - 1])}+${u}`;
  return [first, ...middle, last];
}

// Classes from fixed edges. `edges` are ascending upper bounds; one extra
// open-ended class is added above the last edge, so there are
// edges.length + 1 classes. Colours are spread across the 7-step palette, or
// taken straight from the 10-step one when there are exactly 10 classes.
export function fixedClasses(
  edges: number[],
  isDark: boolean,
  opts: FixedClassOptions = {},
): FixedClassification {
  const { reverse = false, closed = "upper" } = opts;
  if (edges.length === 0) throw new Error("fixedClasses: need at least one edge");
  for (let i = 1; i < edges.length; i++) {
    if (!(edges[i] > edges[i - 1])) throw new Error("fixedClasses: edges must be strictly ascending");
  }

  const n = edges.length + 1;
  const labels = opts.labels ?? defaultLabels(edges, closed, "");
  if (labels.length !== n) {
    throw new Error(`fixedClasses: expected ${n} labels, got ${labels.length}`);
  }

  const palette: readonly string[] = n === 10
    ? (isDark ? mapSeq10.dark : mapSeq10.light)
    : (isDark ? mapSeq.dark : mapSeq.light);
  const colorAt = (i: number) =>
    palette[Math.round((i / (n - 1)) * (palette.length - 1))];

  const breaks: LabelledClassBreak[] = Array.from({ length: n }, (_, i) => ({
    min: i === 0 ? -Infinity : edges[i - 1],
    max: i === n - 1 ? Infinity : edges[i],
    color: colorAt(reverse ? n - 1 - i : i),
    label: labels[i],
  }));

  return {
    breaks,
    lowPopColor: isDark ? mapSeq.lowPop.dark : mapSeq.lowPop.light,
    noDataColor: isDark ? noData.dark : noData.light,
    closed,
  };
}

// Colour for a value under a fixed classification. Null, undefined and
// non-finite values get the no-data colour.
export function classifyFixed(
  value: number | null | undefined,
  cls: FixedClassification,
): string {
  if (value == null || !Number.isFinite(value)) return cls.noDataColor;
  const { breaks, closed } = cls;
  for (let i = 0; i < breaks.length - 1; i++) {
    const b = breaks[i].max;
    if (closed === "upper" ? value <= b : value < b) return breaks[i].color;
  }
  return breaks[breaks.length - 1].color;
}

export type FixedPreset = { edges: number[] } & FixedClassOptions;

// IMD deciles: integer 1–10, decile 1 = most deprived, so reversed.
export const IMD_PRESET: FixedPreset = {
  edges: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  reverse: true,
  labels: [
    "1 (most deprived)", "2", "3", "4", "5", "6", "7", "8", "9",
    "10 (least deprived)",
  ],
};

// Distance to nearest station, metres. 7 classes: ≤250 … >2,000.
export const STATION_PRESET: FixedPreset = {
  edges: [250, 500, 750, 1000, 1500, 2000],
  labels: defaultLabels([250, 500, 750, 1000, 1500, 2000], "upper", "m"),
};

// Nearby park area, hectares. 6 classes: <5 … 80+. Small is worse, so reversed.
export const PARK_PRESET: FixedPreset = {
  edges: [5, 10, 20, 40, 80],
  reverse: true,
  closed: "lower",
  labels: defaultLabels([5, 10, 20, 40, 80], "lower", "ha"),
};
