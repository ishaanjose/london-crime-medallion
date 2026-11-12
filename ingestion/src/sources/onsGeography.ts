import { withRetry } from "../retry.js";

export const LSOA21_BOUNDARIES_LAYER =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA_2021_EW_BFE_V10_RUC/FeatureServer/3";

export const LSOA21_POP_CENTROIDS_LAYER =
  "https://services-eu1.arcgis.com/6BsumkdKnml1ntNV/arcgis/rest/services/2021_LSOA_Population_Weighted_Centroid/FeatureServer/0";

export const LSOA11_LSOA21_LAD22_LOOKUP_LAYER =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA11_LSOA21_LAD22_EW_LU_v5/FeatureServer/0";

export const ONSPD_LATEST_LAYER =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/ONSPD_Online_latest_Postcode_Centroids/FeatureServer/0";

const LAYER_MOVED_HINT =
  "The service may have moved or become private; find the current public layer via arcgis.com sharing search, owner ONSGeography";

export interface LayerInfo {
  dataLastEditDate: Date;
  maxRecordCount: number;
  objectIdField: string;
  fields: string[];
}

interface LayerInfoResponse {
  editingInfo?: {
    dataLastEditDate?: unknown;
  };
  maxRecordCount?: unknown;
  objectIdField?: unknown;
  fields?: unknown;
  error?: unknown;
}

export interface FetchFeaturesOptions {
  label: string;
  outFields: string;
  returnGeometry: boolean;
  format: "geojson" | "json";
  where?: string;
  extraParams?: Record<string, string>;
}

export async function getLayerInfo(layerUrl: string): Promise<LayerInfo> {
  const response = await withRetry(async () => {
    const response = await fetch(`${layerUrl}?f=json`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ONS layer info for ${layerUrl}: ${response.status} ${response.statusText}. ${LAYER_MOVED_HINT}`,
      );
    }
    return response;
  });

  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null) {
    throw new Error("ONS layer response is not an object");
  }

  if ("error" in data) {
    throw new Error(
      `ONS layer ${layerUrl} returned an error: ${JSON.stringify(data.error)}. ${LAYER_MOVED_HINT}`,
    );
  }

  const layerInfo = data as LayerInfoResponse;
  const timestamp = layerInfo.editingInfo?.dataLastEditDate;
  const maxRecordCount = layerInfo.maxRecordCount;
  const objectIdField = layerInfo.objectIdField;
  const fields = layerInfo.fields;
  if (
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    typeof maxRecordCount !== "number" ||
    !Number.isFinite(maxRecordCount) ||
    typeof objectIdField !== "string" ||
    objectIdField.length === 0 ||
    !Array.isArray(fields)
  ) {
    throw new Error(
      "ONS layer response is missing editingInfo.dataLastEditDate, maxRecordCount, objectIdField, or fields",
    );
  }
  const fieldNames = fields.map((field) => {
    if (
      typeof field !== "object" ||
      field === null ||
      !("name" in field) ||
      typeof field.name !== "string" ||
      field.name.length === 0
    ) {
      throw new Error("ONS layer response contains an invalid field");
    }
    return field.name;
  });

  const dataLastEditDate = new Date(timestamp);
  if (Number.isNaN(dataLastEditDate.getTime())) {
    throw new Error("ONS layer response has an invalid dataLastEditDate");
  }

  return {
    dataLastEditDate,
    maxRecordCount,
    objectIdField,
    fields: fieldNames,
  };
}

export function findField(info: LayerInfo, pattern: RegExp): string {
  const matches = info.fields.filter((field) => pattern.test(field));
  if (matches.length === 0) {
    throw new Error(`ONS layer has no field matching ${pattern}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `ONS layer has multiple fields matching ${pattern}: ${matches.join(", ")}`,
    );
  }
  return matches[0]!;
}

export async function fetchAllFeatures(
  layerUrl: string,
  layerInfo: LayerInfo,
  options: FetchFeaturesOptions,
): Promise<unknown[]> {
  const features: unknown[] = [];
  let lastObjectId = 0;
  const requestsObjectId =
    options.outFields !== "*" &&
    !options.outFields
      .split(",")
      .some((field) => field.trim().toUpperCase() === layerInfo.objectIdField.toUpperCase());

  while (true) {
    const where = `(${options.where ?? "1=1"}) AND ${layerInfo.objectIdField} > ${lastObjectId}`;
    const params = new URLSearchParams({
      where,
      outFields: requestsObjectId
        ? `${options.outFields},${layerInfo.objectIdField}`
        : options.outFields,
      returnGeometry: String(options.returnGeometry),
      outSR: "4326",
      orderByFields: `${layerInfo.objectIdField} ASC`,
      resultRecordCount: String(layerInfo.maxRecordCount),
      f: options.format,
      ...options.extraParams,
    });
    const data = await withRetry(async () => {
      const response = await fetch(`${layerUrl}/query?${params}`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ONS features: ${response.status} ${response.statusText}`,
        );
      }
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null) {
        throw new Error("ONS feature response is not an object");
      }
      if ("error" in data) {
        throw new Error(
          `ONS feature response contains an error: ${JSON.stringify(data.error)}`,
        );
      }
      return data;
    });

    const page = (data as { features?: unknown }).features;
    if (!Array.isArray(page)) {
      throw new Error("ONS feature response has no features array");
    }
    if (page.length === 0) break;

    const pageObjectIds = page.map((feature) =>
      getObjectId(feature, layerInfo.objectIdField, options.format),
    );
    if (pageObjectIds.some((objectId) => objectId === undefined)) {
      throw new Error(
        `ONS feature response is missing ${layerInfo.objectIdField} required for pagination`,
      );
    }
    const maxPageObjectId = Math.max(...(pageObjectIds as number[]));
    if (maxPageObjectId <= lastObjectId) {
      throw new Error("ONS feature pagination did not advance");
    }
    lastObjectId = maxPageObjectId;

    features.push(
      ...page.map((feature) =>
        requestsObjectId
          ? removeObjectId(feature, layerInfo.objectIdField, options.format)
          : feature,
      ),
    );
    console.log(`${options.label}: ${features.length}`);
    const responseData = data as {
      exceededTransferLimit?: unknown;
      properties?: { exceededTransferLimit?: unknown };
    };
    const exceededTransferLimit =
      responseData.exceededTransferLimit ??
      responseData.properties?.exceededTransferLimit;
    if (page.length === 0 || !exceededTransferLimit) {
      break;
    }
  }

  const countParams = new URLSearchParams({
    where: options.where ?? "1=1",
    returnCountOnly: "true",
    f: "json",
    ...options.extraParams,
  });
  const countData = await withRetry(async () => {
    const response = await fetch(`${layerUrl}/query?${countParams}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ONS feature count: ${response.status} ${response.statusText}`,
      );
    }
    const countData: unknown = await response.json();
    if (typeof countData !== "object" || countData === null) {
      throw new Error("ONS feature count response is not an object");
    }
    if ("error" in countData) {
      throw new Error(
        `ONS feature count response contains an error: ${JSON.stringify(countData.error)}`,
      );
    }
    return countData;
  });
  const count = (countData as { count?: unknown }).count;
  if (typeof count !== "number" || !Number.isFinite(count)) {
    throw new Error("ONS feature count response has no valid count");
  }
  if (features.length !== count) {
    throw new Error(
      `${options.label}: fetched ${features.length} features, expected ${count}`,
    );
  }

  return features;
}

function getObjectId(
  feature: unknown,
  objectIdField: string,
  format: FetchFeaturesOptions["format"],
): number | undefined {
  if (typeof feature !== "object" || feature === null) {
    return undefined;
  }
  if (format === "geojson" && "id" in feature) {
    const id = (feature as { id?: unknown }).id;
    if (typeof id === "number" && Number.isFinite(id)) {
      return id;
    }
  }
  const container =
    format === "geojson"
      ? "properties" in feature
        ? feature.properties
        : undefined
      : "attributes" in feature
        ? feature.attributes
        : undefined;
  if (typeof container !== "object" || container === null || !(objectIdField in container)) {
    return undefined;
  }
  const objectId = (container as Record<string, unknown>)[objectIdField];
  return typeof objectId === "number" && Number.isFinite(objectId)
    ? objectId
    : undefined;
}

function removeObjectId(
  feature: unknown,
  objectIdField: string,
  format: FetchFeaturesOptions["format"],
): unknown {
  if (typeof feature !== "object" || feature === null) {
    return feature;
  }
  if (
    format === "json" &&
    "attributes" in feature &&
    typeof feature.attributes === "object" &&
    feature.attributes !== null
  ) {
    const { [objectIdField]: _, ...attributes } =
      feature.attributes as Record<string, unknown>;
    return { ...feature, attributes };
  }
  if (
    format === "geojson" &&
    "properties" in feature &&
    typeof feature.properties === "object" &&
    feature.properties !== null
  ) {
    const { [objectIdField]: _, ...properties } =
      feature.properties as Record<string, unknown>;
    const { id: _id, ...featureWithoutId } = feature as Record<string, unknown>;
    return { ...featureWithoutId, properties };
  }
  return feature;
}
