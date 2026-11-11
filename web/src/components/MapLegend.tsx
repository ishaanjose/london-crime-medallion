import type { ClassBreak } from "@/lib/classify";

type Props = {
  breaks: ClassBreak[];
  lowPopColor: string;
  measure: "rate" | "count";
  showLowPop: boolean;
  windowLabel: string; // e.g. "12 months to Sep 2026"
};

function fmtRate(v: number): string {
  return v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

type LegendRow = { label: string; color: string };

// Build integer-snapped, non-overlapping ranges from float quantile breaks.
// Class i covers whole numbers from (floor(prev.max) + 1) to floor(max).
// The first class starts at 0. Empty integer ranges are dropped.
// The final surviving class is labelled "N+" to signal open-ended upper bound.
function buildCountRows(breaks: ClassBreak[]): LegendRow[] {
  const rows: LegendRow[] = [];
  for (let i = 0; i < breaks.length; i++) {
    const labelMin = i === 0 ? 0 : Math.floor(breaks[i - 1].max) + 1;
    const labelMax = Math.floor(breaks[i].max);
    if (labelMin > labelMax) continue; // empty integer range — skip
    rows.push({ label: `${labelMin}|${labelMax}`, color: breaks[i].color });
  }

  return rows.map(({ label, color }, i) => {
    const isLast = i === rows.length - 1;
    const [labelMin, labelMax] = label.split("|").map(Number);
    let text: string;
    if (isLast) {
      text = `${labelMin}+`;
    } else if (labelMin === labelMax) {
      text = String(labelMin);
    } else {
      text = `${labelMin}–${labelMax}`;
    }
    return { label: text, color };
  });
}

function buildRateRows(breaks: ClassBreak[]): LegendRow[] {
  return breaks.map((b, i) => ({
    label:
      i === breaks.length - 1
        ? `${fmtRate(b.min)}+`
        : `${fmtRate(b.min)}–${fmtRate(b.max)}`,
    color: b.color,
  }));
}

export default function MapLegend({ breaks, lowPopColor, measure, showLowPop, windowLabel }: Props) {
  const title =
    measure === "rate"
      ? `Crimes per 1,000 residents, ${windowLabel}`
      : `Crime count, ${windowLabel}`;

  const rows = measure === "count" ? buildCountRows(breaks) : buildRateRows(breaks);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-medium text-[var(--fg)] mb-2">{title}</p>
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-4 h-3 rounded-sm shrink-0"
              style={{ background: row.color }}
            />
            <span className="tabular-nums text-xs text-[var(--fg-muted)]">{row.label}</span>
          </div>
        ))}
        {showLowPop && (
          <div className="flex items-center gap-2 mt-1">
            <span
              className="inline-block w-4 h-3 rounded-sm shrink-0"
              style={{ background: lowPopColor }}
            />
            <span className="text-xs text-[var(--fg-muted)] italic">Low population</span>
          </div>
        )}
      </div>
    </div>
  );
}
