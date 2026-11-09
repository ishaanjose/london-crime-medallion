import { withRetry } from "../retry.js";

export const LSOA21_BOUNDARIES_LAYER =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BGC_V5/FeatureServer/0";

export const LSOA11_LSOA21_LAD22_LOOKUP_LAYER =
  "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA11_LSOA21_LAD22_EW_LU_v5/FeatureServer/0";

export interface LayerInfo {
  dataLastEditDate: Date;
  maxRecordCount: number;
}

interface LayerInfoResponse {
  editingInfo?: {
    dataLastEditDate?: unknown;
  };
  maxRecordCount?: unknown;
  error?: unknown;
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
  if (
    typeof timestamp !== "number" ||
    !Number.isFinite(timestamp) ||
    typeof maxRecordCount !== "number" ||
    !Number.isFinite(maxRecordCount)
  ) {
    throw new Error(
      "ONS layer response is missing editingInfo.dataLastEditDate or maxRecordCount",
    );
  }

  const dataLastEditDate = new Date(timestamp);
  if (Number.isNaN(dataLastEditDate.getTime())) {
    throw new Error("ONS layer response has an invalid dataLastEditDate");
  }

  return { dataLastEditDate, maxRecordCount };
}
