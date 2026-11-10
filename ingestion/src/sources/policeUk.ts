import { withRetry } from "../retry.js";

export const LATEST_ARCHIVE_URL =
  "https://data.police.uk/data/archive/latest.zip";

export function archiveUrl(month: string): string {
  return `https://data.police.uk/data/archive/${month}.zip`;
}

// These snapshots, together with latest, cover December 2010 to the present.
// Yearly snapshots so every outcome month sits at least 24 months into some archive.
// Archives only include outcomes for crimes inside their own 36-month window,
// so a month near the start of an archive is missing outcomes for older crimes.
export const BACKFILL_ARCHIVES = [
  "2017-04", "2017-09", "2018-09", "2019-09", "2020-09",
  "2021-09", "2022-09", "2023-09", "2024-09", "2025-09",
];

export interface ArchiveInfo {
  md5: string;
  lastModified: Date;
  sizeBytes: number;
}

function requireHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) {
    throw new Error(`Header "${name}" not found`);
  }
  return value;
}

export async function getArchiveInfo(url: string): Promise<ArchiveInfo> {
  const response = await withRetry(async () => {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch headers: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  });

  const md5 = requireHeader(response.headers, "x-amz-meta-md5").toLowerCase();
  const lastModified = new Date(
    requireHeader(response.headers, "last-modified"),
  );
  if (Number.isNaN(lastModified.getTime())) {
    throw new Error('Header "last-modified" is not a valid date');
  }

  const sizeBytes = Number(requireHeader(response.headers, "content-length"));
  if (Number.isNaN(sizeBytes)) {
    throw new Error('Header "content-length" is not a valid number');
  }

  return { md5, lastModified, sizeBytes };
}
