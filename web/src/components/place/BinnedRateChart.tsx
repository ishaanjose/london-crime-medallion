"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  ErrorBar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@/lib/useQuery";
import { formatMonth } from "@/lib/format";
import { chart } from "@/lib/theme";
import {
  FACTORS, buildBinnedRateSql, strengthLabel, type Factor, type BinnedRateRow,
} from "@/lib/place";
import SectionBoundary from "@/components/SectionBoundary";

type Props = {
  factor: Factor;
  compact?: boolean;
};

type Band = {
  label: string;
  tick: string;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  // [below, above] the median, for the asymmetric IQR whisker
  iqr: [number, number] | null;
};

const fmt1 = (v: number) =>
  v.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (v: number) => v.toLocaleString("en-GB");

const HEIGHT = 260;
const COMPACT_HEIGHT = 160;

function Skeleton({ compact }: { compact: boolean }) {
  return (
    <div className="animate-pulse space-y-2" aria-hidden="true">
      <div className="h-4 w-72 max-w-full rounded bg-[var(--skeleton)]" />
      <div
        className="rounded bg-[var(--skeleton)]"
        style={{ height: compact ? COMPACT_HEIGHT : HEIGHT }}
      />
      <div className="h-4 w-full rounded bg-[var(--skeleton)]" />
    </div>
  );
}

function buildBands(factor: Factor, rows: BinnedRateRow[]): Band[] {
  const { labels = [] } = FACTORS[factor].preset;
  const byBand = new Map(rows.map((r) => [r.band, r]));
  return labels.map((label, i) => {
    const r = byBand.get(i);
    return {
      label,
      // Decile labels carry "(most deprived)"; the axis title explains direction.
      tick: label.replace(/ \(.*\)$/, ""),
      n: r?.n ?? 0,
      median: r?.median ?? null,
      p25: r?.p25 ?? null,
      p75: r?.p75 ?? null,
      iqr: r ? [r.median - r.p25, r.p75 - r.median] : null,
    };
  });
}

function takeaway(factor: Factor, bands: Band[], spearman: number | null): string | null {
  const first = bands[0];
  const last = bands[bands.length - 1];
  if (spearman == null || first?.median == null || last?.median == null) return null;
  const { firstBand, lastBand } = FACTORS[factor];
  return `Median rate is ${fmt1(first.median)} per 1,000 ${firstBand} and ${fmt1(last.median)} ${lastBand} (Spearman ${spearman.toFixed(2)}, ${strengthLabel(spearman)}).`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BandTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload as Band;
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 text-xs shadow-md">
      <p className="font-medium text-[var(--fg)]">{b.label}</p>
      {b.median == null ? (
        <p className="mt-1 italic text-[var(--fg-muted)]">No LSOAs</p>
      ) : (
        <>
          <p className="mt-1 tabular-nums text-[var(--fg)]">Median {fmt1(b.median)} per 1,000</p>
          <p className="tabular-nums text-[var(--fg-muted)]">IQR {fmt1(b.p25!)}–{fmt1(b.p75!)}</p>
          <p className="tabular-nums text-[var(--fg-muted)]">{fmtInt(b.n)} LSOAs</p>
        </>
      )}
    </div>
  );
}

function Chart({ factor, compact }: { factor: Factor; compact: boolean }) {
  const { data, error, loading } = useQuery<BinnedRateRow>((index) =>
    buildBinnedRateSql(index, factor),
  );

  const bands = useMemo(() => (data ? buildBands(factor, data) : []), [data, factor]);
  const meta = data?.[0];
  const yMax = useMemo(() => {
    const top = Math.max(0, ...bands.map((b) => b.p75 ?? 0));
    return Math.ceil(top / 20) * 20 || 20;
  }, [bands]);

  // Thrown so the surrounding SectionBoundary shows it; its "Try again"
  // remounts this component, which re-runs the query.
  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton compact={compact} />;
  if (!meta) throw new Error("No LSOAs with both a crime rate and a value for this factor.");

  const { axisLabel } = FACTORS[factor];
  const yTitle = `Crimes per 1,000 residents, 12 months to ${formatMonth(meta.latest_month)}`;
  const line = takeaway(factor, bands, meta.spearman);
  const height = compact ? COMPACT_HEIGHT : HEIGHT;

  return (
    <figure className="space-y-2">
      {/* Y-axis title sits above the plot: too long to rotate at this height */}
      <p className="text-xs text-[var(--fg-muted)]">{yTitle}</p>
      <div role="img" aria-label={`${yTitle} by ${axisLabel}. ${line ?? ""}`}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={bands} margin={{ top: 4, right: 8, bottom: compact ? 0 : 16, left: 0 }}>
            <CartesianGrid strokeDasharray="3 0" stroke={chart.grid} vertical={false} />
            <XAxis
              dataKey="tick"
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              label={compact ? undefined : {
                value: axisLabel,
                position: "insideBottom",
                offset: -12,
                style: { fontSize: 11, fill: "var(--fg-muted)" },
              }}
            />
            <YAxis
              domain={[0, yMax]}
              tickFormatter={(v: number) => fmtInt(v)}
              tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<BandTooltip />} cursor={{ fill: "var(--chart-fill)", fillOpacity: 0.5 }} />
            <Bar dataKey="median" fill={chart.bar} fillOpacity={0.6} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              <ErrorBar dataKey="iqr" direction="y" width={6} stroke="var(--fg-muted)" strokeWidth={1.5} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {line && <p className="text-sm text-[var(--fg)]">{line}</p>}
      {!compact && (
        <figcaption className="text-xs text-[var(--fg-muted)]">
          Bars are the median LSOA rate in each band; whiskers span the 25th to 75th
          percentile. Excludes anti-social behaviour
          {meta.excluded_groups ? `, ${meta.excluded_groups} (police.uk coverage gap)` : ""}
          {meta.low_pop_n > 0 ? ` and ${fmtInt(meta.low_pop_n)} low-population LSOAs` : ""}.
        </figcaption>
      )}
    </figure>
  );
}

export default function BinnedRateChart({ factor, compact = false }: Props) {
  return (
    <SectionBoundary>
      {/* key: useQuery runs once per mount, so remount when the factor changes */}
      <Chart key={factor} factor={factor} compact={compact} />
    </SectionBoundary>
  );
}
