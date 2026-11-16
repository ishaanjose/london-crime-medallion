import { stat } from "node:fs/promises";
import { join } from "node:path";

import { isFileNotFound } from "./fsUtils.js";
import { getArchiveMd5 } from "./manifest.js";
import { DATA_DIR } from "./paths.js";
import {
  ARCHIVE_LIST_URL,
  archiveUrl,
  BACKFILL_ARCHIVES,
  getArchiveInfo,
  getHostedArchiveMonths,
} from "./sources/policeUk.js";

export interface BackfillPlan {
  // Passed to ingestArchive: not in bronze, republished with a new md5, or
  // headers unreadable (ingestArchive retries and reports the failure).
  toIngest: string[];
  // In bronze with the md5 police.uk still serves; skipped, no download.
  upToDate: string[];
  // In bronze but police.uk serves a different md5; re-ingested.
  republished: string[];
  // In bronze but no longer hosted; bronze copy kept with a warning.
  keptNotHosted: string[];
  // Not in bronze and no longer hosted by police.uk.
  missing: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isFileNotFound(error)) {
      return false;
    }
    throw error;
  }
}

// An archive is in bronze when the manifest records it and both partitions exist.
export async function archiveInBronze(month: string): Promise<boolean> {
  if (!(await getArchiveMd5(month))) {
    return false;
  }
  for (const dataset of ["street", "outcomes"]) {
    const dir = join(DATA_DIR, "bronze/police_uk", dataset, `archive=${month}`);
    if (!(await isDirectory(dir))) {
      return false;
    }
  }
  return true;
}

export function missingArchivesMessage(missing: string[]): string {
  return (
    `police.uk no longer hosts ${missing.map((month) => `${month}.zip`).join(", ")} ` +
    `and data/bronze has no copy. Replace them in BACKFILL_ARCHIVES ` +
    `(src/sources/policeUk.ts) with archives still listed at ${ARCHIVE_LIST_URL}`
  );
}

export async function planBackfill(
  months: readonly string[] = BACKFILL_ARCHIVES,
): Promise<BackfillPlan> {
  const inBronze: string[] = [];
  const notInBronze: string[] = [];
  for (const month of months) {
    (await archiveInBronze(month) ? inBronze : notInBronze).push(month);
  }

  let hosted: Set<string> | undefined;
  try {
    hosted = await getHostedArchiveMonths();
  } catch (error) {
    console.warn(
      `police_uk backfill: WARNING could not read the police.uk archive list (${errorMessage(error)}); archives not in bronze will be requested directly`,
    );
  }

  const keptNotHosted = hosted
    ? inBronze.filter((month) => !hosted.has(month))
    : [];
  if (keptNotHosted.length > 0) {
    console.warn(
      `police_uk backfill: WARNING police.uk no longer hosts ${keptNotHosted.join(", ")}; data/bronze already has them, so they are kept`,
    );
  }

  // Still hosted (or unknown): same md5 rule as before, a new md5 is re-ingested.
  const upToDate: string[] = [];
  const republished: string[] = [];
  const unreadable: string[] = [];
  for (const month of inBronze) {
    if (keptNotHosted.includes(month)) {
      continue;
    }
    let upstreamMd5: string;
    try {
      upstreamMd5 = (await getArchiveInfo(archiveUrl(month))).md5;
    } catch (error) {
      console.warn(
        `police_uk ${month}: WARNING could not read archive headers (${errorMessage(error)}); handing to ingest`,
      );
      unreadable.push(month);
      continue;
    }
    const bronzeMd5 = await getArchiveMd5(month);
    if (upstreamMd5 === bronzeMd5) {
      upToDate.push(month);
    } else {
      console.log(
        `police_uk ${month}: police.uk md5 ${upstreamMd5} differs from bronze ${bronzeMd5}; re-ingesting`,
      );
      republished.push(month);
    }
  }

  const missing = hosted
    ? notInBronze.filter((month) => !hosted.has(month))
    : [];
  const toIngest = months.filter(
    (month) =>
      republished.includes(month) ||
      unreadable.includes(month) ||
      (notInBronze.includes(month) && !missing.includes(month)),
  );
  return { toIngest, upToDate, republished, keptNotHosted, missing };
}
