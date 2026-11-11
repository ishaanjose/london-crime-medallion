"use client";

import { useQuery } from "@/lib/useQuery";
import { formatMonth } from "@/lib/format";
import { buildAreaMixSql, type AreaMixRow } from "@/lib/area";
import SectionBoundary from "@/components/SectionBoundary";

type Props = { lsoa: string };

const AREA_COLOR = "var(--chart-1)";
const LONDON_COLOR = "var(--chart-2)";

const pct = (v: number | null) =>
  v == null ? "No data" : `${(v * 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })}%`;

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden="true">
      <div className="h-4 w-56 rounded bg-[var(--skeleton)]" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="hidden sm:block w-44 h-4 shrink-0 rounded bg-[var(--skeleton)]" />
          <div className="flex-1 space-y-1">
            <div className="h-3 rounded bg-[var(--skeleton)]" />
            <div className="h-3 rounded bg-[var(--skeleton)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Bar({ share, max, color }: { share: number | null; max: number; color: string }) {
  const width = share != null && max > 0 ? (share / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 relative h-3">
        <div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
      <span className="w-10 shrink-0 tabular-nums text-xs text-right text-[var(--fg)]">
        {pct(share)}
      </span>
    </div>
  );
}

function Mix({ lsoa }: Props) {
  const { data, error, loading } = useQuery<AreaMixRow>((index) => buildAreaMixSql(index, lsoa));

  if (error) throw new Error(error);
  if (loading || !data) return <Skeleton />;
  if (data.length === 0) throw new Error("No crimes recorded in London in this window.");

  const meta = data[0];
  const noCrimes = data.every((r) => r.area_n === 0);
  const max = Math.max(...data.flatMap((r) => [r.area_share ?? 0, r.london_share]));

  return (
    <figure>
      <p className="text-xs text-[var(--fg-muted)]">
        Share of crimes by group, 12 months to {formatMonth(meta.latest_month)}
      </p>
      <div className="mt-2 mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--fg-muted)]" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: AREA_COLOR }} />
          This LSOA
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LONDON_COLOR }} />
          London
        </span>
      </div>

      {noCrimes ? (
        <p className="text-sm text-[var(--fg)]">No crimes were recorded in this LSOA in this window.</p>
      ) : (
        <ul className="space-y-3 sm:space-y-2">
          {data.map((r) => (
            <li
              key={r.crime_group}
              className="sm:flex sm:items-center sm:gap-3"
            >
              <span className="sr-only">
                {`${r.crime_group}: ${pct(r.area_share)} of crimes in this LSOA, ${pct(r.london_share)} in London`}
              </span>
              <div aria-hidden="true" className="text-xs text-[var(--fg-muted)] mb-1 sm:mb-0 sm:w-44 sm:shrink-0 sm:text-right sm:truncate">
                {r.crime_group}
              </div>
              <div className="flex-1 space-y-0.5" aria-hidden="true">
                <Bar share={r.area_share} max={max} color={AREA_COLOR} />
                <Bar share={r.london_share} max={max} color={LONDON_COLOR} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <figcaption className="mt-3 text-xs text-[var(--fg-muted)]">
        Excludes anti-social behaviour
        {meta.excluded_groups ? ` and ${meta.excluded_groups} (police.uk coverage gap)` : ""}.
        A small area has few crimes, so its shares can swing with a handful of cases.
      </figcaption>
    </figure>
  );
}

export default function AreaCrimeMix(props: Props) {
  return (
    <SectionBoundary>
      <Mix {...props} />
    </SectionBoundary>
  );
}
