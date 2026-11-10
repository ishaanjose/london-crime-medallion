import { randomUUID } from "node:crypto";

import { landAttributeTable, landGeoJson } from "./landOnsGeography.js";
import {
  hasIngestedOnsLayer,
  onsLayerKey,
  writeOnsLayer,
} from "./manifest.js";
import {
  fetchAllFeatures,
  getLayerInfo,
  LSOA11_LSOA21_LAD22_LOOKUP_LAYER,
  LSOA21_BOUNDARIES_LAYER,
  LSOA21_POP_CENTROIDS_LAYER,
  findField,
  ONSPD_LATEST_LAYER,
} from "./sources/onsGeography.js";
import type { LayerInfo } from "./sources/onsGeography.js";

interface OnsLayerConfig {
  layerName: string;
  layerUrl: string;
  outFields: string;
  returnGeometry: boolean;
  format: "geojson" | "json";
  where?: (info: LayerInfo) => string;
  extraParams?: Record<string, string>;
  land: (
    features: unknown[],
    editDate: string,
    batchId: string,
  ) => Promise<void>;
}

const LONDON_ENVELOPE: Record<string, string> = {
  geometry: "503000,155000,562000,202000",
  geometryType: "esriGeometryEnvelope",
  inSR: "27700",
  spatialRel: "esriSpatialRelIntersects",
};

const LAYERS: OnsLayerConfig[] = [
  {
    layerName: "lsoa21 boundaries",
    layerUrl: LSOA21_BOUNDARIES_LAYER,
    outFields: "LSOA21CD,LSOA21NM",
    returnGeometry: true,
    format: "geojson",
    extraParams: LONDON_ENVELOPE,
    land: (features, editDate) =>
      landGeoJson("lsoa21_boundaries", features, editDate),
  },
  {
    layerName: "lsoa21 population centroids",
    layerUrl: LSOA21_POP_CENTROIDS_LAYER,
    outFields: "LSOA21CD",
    returnGeometry: true,
    format: "geojson",
    extraParams: LONDON_ENVELOPE,
    land: (features, editDate) =>
      landGeoJson("lsoa21_pop_centroids", features, editDate),
  },
  {
    layerName: "lsoa lookup",
    layerUrl: LSOA11_LSOA21_LAD22_LOOKUP_LAYER,
    outFields: "*",
    returnGeometry: false,
    format: "json",
    land: (features, editDate, batchId) =>
      landAttributeTable("lsoa_lookup", features, editDate, batchId),
  },
  {
    layerName: "postcodes",
    layerUrl: ONSPD_LATEST_LAYER,
    outFields:
      "PCDS,DOINTR,DOTERM,USRTYPIND,OA21CD,LSOA21CD,MSOA21CD,LSOA11CD,LAT,LONG",
    returnGeometry: false,
    format: "json",
    where: (info) => `${findField(info, /^RGN\d{2}CD$/)} = 'E12000007'`,
    land: (features, editDate, batchId) =>
      landAttributeTable("postcodes", features, editDate, batchId),
  },
];

export async function ingestOnsGeography(): Promise<void> {
  for (const layer of LAYERS) {
    const layerInfo = await getLayerInfo(layer.layerUrl);
    const key = onsLayerKey(layer.layerName, layerInfo.dataLastEditDate);
    if (await hasIngestedOnsLayer(key)) {
      console.log(`${layer.layerName}: up to date`);
      continue;
    }

    const fetchOptions = {
      label: layer.layerName,
      outFields: layer.outFields,
      returnGeometry: layer.returnGeometry,
      format: layer.format,
      ...(layer.where ? { where: layer.where(layerInfo) } : {}),
      ...(layer.extraParams ? { extraParams: layer.extraParams } : {}),
    };
    const features = await fetchAllFeatures(
      layer.layerUrl,
      layerInfo,
      fetchOptions,
    );
    const editDate = layerInfo.dataLastEditDate.toISOString().slice(0, 10);
    await layer.land(features, editDate, randomUUID());
    await writeOnsLayer(layer.layerName, layerInfo.dataLastEditDate);
  }
}
