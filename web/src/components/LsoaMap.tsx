"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { classifyFixed, classifyValue, type ClassBreak, type FixedClassification } from "@/lib/classify";
import { dataUrl } from "@/lib/data";

export type LsoaValue = {
  lsoa21_code: string;
  n: number;
  pop: number | null;
  low_pop: boolean;
  per_1000: number | null;
};

export type DimRow = {
  lsoa21_code: string;
  lsoa21_name: string;
  borough_name: string;
  imd_decile_2025: number | null;
  income_decile_2025: number | null;
  employment_decile_2025: number | null;
  nearest_station_m: number | null;
  nearest_station_name: string | null;
  nearest_station_network: string | null;
  stations_within_1km: number | null;
  nearest_park_entrance_m: number | null;
  nearest_park_name: string | null;
  park_ha_within_1km: number | null;
};

export type MapLayer = "crime" | "imd" | "station" | "park";
export type ContextLayer = Exclude<MapLayer, "crime">;

// The per-LSOA value a context layer is coloured by.
export function contextValue(d: DimRow, layer: ContextLayer): number | null {
  switch (layer) {
    case "imd": return d.imd_decile_2025;
    case "station": return d.nearest_station_m;
    case "park": return d.park_ha_within_1km;
  }
}

const NETWORK_LABEL: Record<string, string> = { tfl: "TfL", national_rail: "National Rail" };

type TooltipState = {
  x: number;
  y: number;
  d: DimRow;
  n: number;
  per_1000: number | null;
  low_pop: boolean;
};

type Props = {
  layer: MapLayer;
  values: LsoaValue[];
  dim: Map<string, DimRow>;
  breaks: ClassBreak[];
  lowPopColor: string;
  measure: "rate" | "count";
  // Classification for context layers; ignored when layer is "crime".
  fixed: FixedClassification | null;
  ariaLabel: string;
  dark: boolean;
};

type Paint = Pick<Props, "layer" | "values" | "dim" | "breaks" | "lowPopColor" | "measure" | "fixed">;

const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE  = "https://tiles.openfreemap.org/styles/dark";

const LONDON_BOUNDS: [[number, number], [number, number]] = [
  [-0.51, 51.28],
  [0.33, 51.69],
];

function applyColors(map: MapLibreMap, p: Paint) {
  if (p.layer !== "crime") {
    if (!p.fixed) return;
    for (const d of p.dim.values()) {
      const color = classifyFixed(contextValue(d, p.layer), p.fixed);
      map.setFeatureState({ source: "lsoa", id: d.lsoa21_code }, { color });
    }
    return;
  }
  const { values, breaks, lowPopColor, measure } = p;
  const isRate = measure === "rate";
  for (const v of values) {
    let color: string;
    if (isRate && v.low_pop) {
      color = lowPopColor;
    } else {
      const val = isRate ? (v.per_1000 ?? 0) : v.n;
      color = classifyValue(val, breaks);
    }
    map.setFeatureState({ source: "lsoa", id: v.lsoa21_code }, { color });
  }
}

function addDataLayers(map: MapLibreMap, dark: boolean) {
  if (!map.getSource("lsoa")) {
    map.addSource("lsoa", {
      type: "geojson",
      data: dataUrl("geo_lsoa.geojson"),
      promoteId: "lsoa21_code",
    });
  }
  if (!map.getSource("borough")) {
    map.addSource("borough", {
      type: "geojson",
      data: dataUrl("geo_borough.geojson"),
    });
  }
  if (!map.getLayer("lsoa-fill")) {
    map.addLayer({
      id: "lsoa-fill",
      type: "fill",
      source: "lsoa",
      paint: {
        "fill-color": ["coalesce", ["feature-state", "color"], "#cccccc"],
        "fill-opacity": 0.85,
      },
    });
  }
  if (!map.getLayer("lsoa-outline")) {
    map.addLayer({
      id: "lsoa-outline",
      type: "line",
      source: "lsoa",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "hovered"], false],
          "#ffffff",
          dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "hovered"], false],
          2,
          0.4,
        ],
      },
    });
  }
  if (!map.getLayer("borough-outline")) {
    map.addLayer({
      id: "borough-outline",
      type: "line",
      source: "borough",
      paint: {
        "line-color": dark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
        "line-width": 1.2,
      },
    });
  }
}

export default function LsoaMap({ layer, values, dim, breaks, lowPopColor, measure, fixed, ariaLabel, dark }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const paintRef = useRef<Paint>({ layer, values, dim, breaks, lowPopColor, measure, fixed });
  const dimRef = useRef(dim);
  const darkRef = useRef(dark);
  // Theme of the basemap style currently on the map (null until the map exists)
  const appliedDarkRef = useRef<boolean | null>(null);
  // Cache byCode so the mousemove handler doesn't rebuild it on every event
  const byCodeRef = useRef<Map<string, LsoaValue>>(new Map());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => { dimRef.current = dim; }, [dim]);
  useEffect(() => { darkRef.current = dark; }, [dark]);
  useEffect(() => {
    byCodeRef.current = new Map(values.map((v) => [v.lsoa21_code, v]));
  }, [values]);

  // Apply feature-state colours whenever anything that affects them changes
  useEffect(() => {
    const p: Paint = { layer, values, dim, breaks, lowPopColor, measure, fixed };
    paintRef.current = p;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyColors(map, p);
  }, [layer, values, dim, breaks, lowPopColor, measure, fixed]);

  // Swap the basemap when the theme changes. This runs after the paint effect
  // above, so paintRef already holds the classes for the new palette.
  // diff: false forces a full rebuild so style.load fires; a diffed swap would
  // drop our layers without firing it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedDarkRef.current === null || appliedDarkRef.current === dark) return;
    appliedDarkRef.current = dark;
    map.once("style.load", () => {
      addDataLayers(map, dark);
      applyColors(map, paintRef.current);
    });
    map.setStyle(dark ? DARK_STYLE : LIGHT_STYLE, { diff: false });
  }, [dark]);

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;

    let hoveredId: string | null = null;

    import("maplibre-gl").then((ml) => {
      if (!containerRef.current) return;

      // Read at import time, not mount, in case the theme flipped while loading
      const dark = darkRef.current;
      const style = dark ? DARK_STYLE : LIGHT_STYLE;

      // Serve the worker from our own origin to avoid Turbopack MIME issues
      ml.setWorkerUrl(
        new URL("/maplibre/maplibre-gl-worker.mjs", window.location.href).href
      );

      const MapClass = ml.Map;
      const NavigationControl = ml.NavigationControl;

      const map = new MapClass({
        container: containerRef.current,
        style,
        bounds: LONDON_BOUNDS,
        fitBoundsOptions: { padding: 20 },
      });

      mapRef.current = map;
      appliedDarkRef.current = dark;
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        addDataLayers(map, appliedDarkRef.current ?? dark);
        applyColors(map, paintRef.current);

        map.on("mousemove", "lsoa-fill", (e) => {
          const feat = e.features?.[0];
          if (!feat) return;
          const id = feat.id as string | undefined;
          if (!id) return;

          if (hoveredId && hoveredId !== id) {
            map.setFeatureState({ source: "lsoa", id: hoveredId }, { hovered: false });
          }
          hoveredId = id;
          map.setFeatureState({ source: "lsoa", id }, { hovered: true });

          const v = byCodeRef.current.get(id);
          const d = dimRef.current.get(id);
          if (!d) return;

          setTooltip({
            x: e.point.x,
            y: e.point.y,
            d,
            n: v?.n ?? 0,
            per_1000: v?.per_1000 ?? null,
            low_pop: v?.low_pop ?? false,
          });
        });

        map.on("mouseleave", "lsoa-fill", () => {
          if (hoveredId) {
            map.setFeatureState({ source: "lsoa", id: hoveredId }, { hovered: false });
            hoveredId = null;
          }
          setTooltip(null);
        });
      });
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        appliedDarkRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        role="region"
        aria-label={ariaLabel}
        className="w-full rounded-md overflow-hidden border border-[var(--border)]"
        style={{ height: "520px" }}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-[var(--border)] bg-[var(--bg)] p-2 text-xs shadow-md min-w-[160px]"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 400) - 180),
            top: Math.max(tooltip.y - 60, 4),
          }}
        >
          <p className="font-medium text-[var(--fg)] leading-tight">{tooltip.d.lsoa21_name}</p>
          <p className="text-[var(--fg-muted)] mt-0.5">{tooltip.d.borough_name}</p>
          <TooltipBody t={tooltip} layer={layer} measure={measure} />
        </div>
      )}
    </div>
  );
}

const fmtInt = (n: number) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
const fmt1 = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Rendered from the current layer, not the one at hover time, so switching
// layers while hovering updates the tooltip without moving the mouse.
function TooltipBody({ t, layer, measure }: { t: TooltipState; layer: MapLayer; measure: "rate" | "count" }) {
  const { d } = t;
  const main = "tabular-nums mt-1 text-[var(--fg)]";
  const sub = "tabular-nums text-[var(--fg-muted)] mt-0.5";
  const noData = <p className={`${main} italic`}>No data</p>;

  switch (layer) {
    case "crime":
      return (
        <>
          <p className={main}>{fmtInt(t.n)} crimes</p>
          {t.low_pop && measure === "rate" ? (
            <p className="text-[var(--fg-muted)] mt-0.5 italic">Too few residents for a reliable rate</p>
          ) : t.per_1000 != null ? (
            <p className={sub}>{fmt1(t.per_1000)} per 1,000</p>
          ) : null}
          {d.imd_decile_2025 != null && <p className={sub}>IMD decile {d.imd_decile_2025}</p>}
        </>
      );
    case "imd":
      if (d.imd_decile_2025 == null) return noData;
      return (
        <>
          <p className={main}>IMD decile {d.imd_decile_2025}</p>
          {d.income_decile_2025 != null && <p className={sub}>Income decile {d.income_decile_2025}</p>}
          {d.employment_decile_2025 != null && <p className={sub}>Employment decile {d.employment_decile_2025}</p>}
        </>
      );
    case "station":
      if (d.nearest_station_m == null) return noData;
      return (
        <>
          <p className={main}>{fmtInt(d.nearest_station_m)} m to nearest station</p>
          {d.nearest_station_name && (
            <p className={sub}>
              {d.nearest_station_name}
              {d.nearest_station_network ? ` (${NETWORK_LABEL[d.nearest_station_network] ?? d.nearest_station_network})` : ""}
            </p>
          )}
          {d.stations_within_1km != null && <p className={sub}>{fmtInt(d.stations_within_1km)} within 1 km</p>}
        </>
      );
    case "park":
      if (d.park_ha_within_1km == null) return noData;
      return (
        <>
          <p className={main}>{fmt1(d.park_ha_within_1km)} ha of park within 1 km</p>
          {d.nearest_park_name && (
            <p className={sub}>
              Nearest: {d.nearest_park_name}
              {d.nearest_park_entrance_m != null ? `, ${fmtInt(d.nearest_park_entrance_m)} m` : ""}
            </p>
          )}
        </>
      );
  }
}
