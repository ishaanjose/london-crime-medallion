import { mapSeq } from "@/lib/theme";

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
