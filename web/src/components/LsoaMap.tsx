"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { classifyValue, type ClassBreak } from "@/lib/classify";
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
};

type TooltipState = {
  x: number;
  y: number;
  lsoa21_name: string;
  borough_name: string;
  n: number;
  per_1000: number | null;
  imd_decile_2025: number | null;
  low_pop: boolean;
};

type Props = {
  values: LsoaValue[];
  dim: Map<string, DimRow>;
  breaks: ClassBreak[];
  lowPopColor: string;
  measure: "rate" | "count";
  ariaLabel: string;
};

const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DARK_STYLE  = "https://tiles.openfreemap.org/styles/dark";

const LONDON_BOUNDS: [[number, number], [number, number]] = [
  [-0.51, 51.28],
  [0.33, 51.69],
];

function isDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  const root = document.documentElement;
  if (root.dataset.theme === "dark") return true;
  if (root.dataset.theme === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyColors(
  map: MapLibreMap,
  values: LsoaValue[],
  breaks: ClassBreak[],
  lowPopColor: string,
  measure: "rate" | "count"
) {
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

export default function LsoaMap({ values, dim, breaks, lowPopColor, measure, ariaLabel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const valuesRef = useRef(values);
  const breaksRef = useRef(breaks);
  const lowPopColorRef = useRef(lowPopColor);
  const measureRef = useRef(measure);
  const dimRef = useRef(dim);
  // Cache byCode so the mousemove handler doesn't rebuild it on every event
  const byCodeRef = useRef<Map<string, LsoaValue>>(new Map());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { breaksRef.current = breaks; }, [breaks]);
  useEffect(() => { lowPopColorRef.current = lowPopColor; }, [lowPopColor]);
  useEffect(() => { measureRef.current = measure; }, [measure]);
  useEffect(() => { dimRef.current = dim; }, [dim]);
  useEffect(() => {
    byCodeRef.current = new Map(values.map((v) => [v.lsoa21_code, v]));
  }, [values]);

  // Apply feature-state colours whenever values/breaks/measure change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyColors(map, values, breaks, lowPopColor, measure);
  }, [values, breaks, lowPopColor, measure]);

  // Create map once
  useEffect(() => {
    if (!containerRef.current) return;

    let cleanupMq: (() => void) | undefined;
    let hoveredId: string | null = null;

    const dark = isDarkMode();
    const style = dark ? DARK_STYLE : LIGHT_STYLE;

    import("maplibre-gl").then((ml) => {
      if (!containerRef.current) return;

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
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        addDataLayers(map, dark);
        applyColors(map, valuesRef.current, breaksRef.current, lowPopColorRef.current, measureRef.current);

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
            lsoa21_name: d.lsoa21_name,
            borough_name: d.borough_name,
            n: v?.n ?? 0,
            per_1000: v?.per_1000 ?? null,
            imd_decile_2025: d.imd_decile_2025,
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

      // Dark mode changes — setStyle() wipes sources and layers, so re-add them
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handleColorSchemeChange = () => {
        const nowDark = isDarkMode();
        map.setStyle(nowDark ? DARK_STYLE : LIGHT_STYLE);
        map.once("style.load", () => {
          addDataLayers(map, nowDark);
          applyColors(map, valuesRef.current, breaksRef.current, lowPopColorRef.current, measureRef.current);
        });
      };
      mq.addEventListener("change", handleColorSchemeChange);
      cleanupMq = () => mq.removeEventListener("change", handleColorSchemeChange);
    });

    return () => {
      cleanupMq?.();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
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
          <p className="font-medium text-[var(--fg)] leading-tight">{tooltip.lsoa21_name}</p>
          <p className="text-[var(--fg-muted)] mt-0.5">{tooltip.borough_name}</p>
          <p className="tabular-nums mt-1 text-[var(--fg)]">
            {tooltip.n.toLocaleString("en-GB", { maximumFractionDigits: 0 })} crimes
          </p>
          {tooltip.low_pop && measure === "rate" ? (
            <p className="text-[var(--fg-muted)] mt-0.5 italic">Too few residents for a reliable rate</p>
          ) : tooltip.per_1000 != null ? (
            <p className="tabular-nums text-[var(--fg-muted)] mt-0.5">
              {tooltip.per_1000.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} per 1,000
            </p>
          ) : null}
          {tooltip.imd_decile_2025 != null && (
            <p className="text-[var(--fg-muted)] mt-0.5">IMD decile {tooltip.imd_decile_2025}</p>
          )}
        </div>
      )}
    </div>
  );
}
