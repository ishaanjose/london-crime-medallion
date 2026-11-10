import { withRetry } from "../retry.js";

export const LSOA21_BOUNDARIES_LAYER =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BGC_V5/FeatureServer/0";

export const LSOA11_LSOA21_LAD22_LOOKUP_LAYER =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA11_LSOA21_LAD22_EW_LU_v5/FeatureServer/0";

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
}

export async function getLayerInfo(layerUrl: string): Promise<LayerInfo> {
  const response = await withRetry(async () => {
    const response = await fetch(`${layerUrl}?f=json`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ONS layer info: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  });

  const data: unknown = await response.json();
  if (typeof data !== "object" || data === null) {
    throw new Error("ONS layer response is not an object");
  }

  if ("error" in data) {
    throw new Error(`ONS layer response contains an error: ${JSON.stringify(data.error)}`);
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
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      where: options.where ?? "1=1",
      outFields: options.outFields,
      returnGeometry: String(options.returnGeometry),
      outSR: "4326",
      orderByFields: layerInfo.objectIdField,
      resultOffset: String(offset),
      resultRecordCount: String(layerInfo.maxRecordCount),
      f: options.format,
    });
    const response = await withRetry(async () => {
      const response = await fetch(`${layerUrl}/query?${params}`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ONS features: ${response.status} ${response.statusText}`,
        );
      }
      return response;
    });

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) {
      throw new Error("ONS feature response is not an object");
    }
    if ("error" in data) {
      throw new Error(
        `ONS feature response contains an error: ${JSON.stringify(data.error)}`,
      );
    }

    const page = (data as { features?: unknown }).features;
    if (!Array.isArray(page)) {
      throw new Error("ONS feature response has no features array");
    }

    features.push(...page);
    offset += page.length;
    console.log(`${options.label}: ${features.length}`);
    const responseData = data as {
      exceededTransferLimit?: unknown;
      properties?: { exceededTransferLimit?: unknown };
    };
    const exceededTransferLimit =
      responseData.exceededTransferLimit ??
      responseData.properties?.exceededTransferLimit;
    if (
      page.length === 0 ||
      exceededTransferLimit === undefined ||
      exceededTransferLimit === false
    ) {
      break;
    }
  }

  const countParams = new URLSearchParams({
    where: options.where ?? "1=1",
    returnCountOnly: "true",
    f: "json",
  });
  const countResponse = await withRetry(async () => {
    const response = await fetch(`${layerUrl}/query?${countParams}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch ONS feature count: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  });
  const countData: unknown = await countResponse.json();
  if (typeof countData !== "object" || countData === null) {
    throw new Error("ONS feature count response is not an object");
  }
  if ("error" in countData) {
    throw new Error(
      `ONS feature count response contains an error: ${JSON.stringify(countData.error)}`,
    );
  }
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
