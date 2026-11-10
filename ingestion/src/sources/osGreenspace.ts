import { withRetry } from "../retry.js";

const OS_PRODUCT_URL =
  "https://api.os.uk/downloads/v1/products/OpenGreenspace";

interface ProductResponse {
  version?: unknown;
}

interface DownloadEntry {
  area?: unknown;
  format?: unknown;
  url?: unknown;
  size?: unknown;
  md5?: unknown;
}

export async function getGreenspaceDownload(): Promise<{
  version: string;
  url: string;
  size: number;
  md5: string;
}> {
  const product = await withRetry(async () => {
    const response = await fetch(OS_PRODUCT_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OS Open Greenspace product: ${response.status} ${response.statusText}`,
      );
    }
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) {
      throw new Error("OS Open Greenspace product response is not an object");
    }
    return data as ProductResponse;
  });
  if (typeof product.version !== "string" || product.version.length === 0) {
    throw new Error("OS Open Greenspace product response is missing version");
  }

  const downloads = await withRetry(async () => {
    const response = await fetch(`${OS_PRODUCT_URL}/downloads`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OS Open Greenspace downloads: ${response.status} ${response.statusText}`,
      );
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("OS Open Greenspace downloads response is not an array");
    }
    return data as DownloadEntry[];
  });

  const matches = downloads.filter(
    (entry) => entry.area === "GB" && entry.format === "GeoPackage",
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one GB GeoPackage download for OS Open Greenspace, found ${matches.length}`,
    );
  }

  const download = matches[0]!;
  if (
    typeof download.url !== "string" ||
    download.url.length === 0 ||
    typeof download.size !== "number" ||
    !Number.isFinite(download.size) ||
    download.size <= 0 ||
    typeof download.md5 !== "string" ||
    download.md5.length === 0
  ) {
    throw new Error("OS Open Greenspace GB GeoPackage download is incomplete");
  }

  return {
    version: product.version,
    url: download.url,
    size: download.size,
    md5: download.md5,
  };
}
