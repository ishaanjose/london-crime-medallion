import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isFileNotFound } from "./fsUtils.js";
import {
  MET_MANIFEST_PATH,
  ONS_MANIFEST_PATH,
  POLICE_UK_MANIFEST_PATH,
} from "./paths.js";
import type { MetRelease } from "./sources/metDatastore.js";
import type { ArchiveInfo } from "./sources/policeUk.js";

interface ManifestEntry {
  md5: string;
  lastModified: string;
  sizeBytes: number;
  ingestedAt: string;
  archiveName: string;
}

interface MetManifestEntry {
  releaseDate: string;
  recentHash: string;
  historicalHash: string;
  recentSize: number;
  historicalSize: number;
  ingestedAt: string;
}

interface OnsManifestEntry {
  layerName: string;
  dataLastEditDate: string;
  ingestedAt: string;
}

async function readEntries<T>(path: string): Promise<T[]> {
  try {
    const entries: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(entries)) {
      throw new Error(`Manifest must contain an array: ${path}`);
    }
    return entries as T[];
  } catch (error) {
    if (isFileNotFound(error)) {
      return [];
    }
    throw error;
  }
}

async function writeEntries<T>(path: string, entries: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  await rename(`${path}.tmp`, path);
}

export function metReleaseKey(
  recentHash: string,
  historicalHash: string,
): string {
  return `${recentHash}+${historicalHash}`;
}

export async function hasIngested(md5: string): Promise<boolean> {
  const entries = await readEntries<ManifestEntry>(POLICE_UK_MANIFEST_PATH);
  return entries.some((entry) => entry.md5 === md5);
}

export async function writeArchiveInfo(
  archiveInfo: ArchiveInfo,
  archiveName: string,
): Promise<void> {
  const entries = await readEntries<ManifestEntry>(POLICE_UK_MANIFEST_PATH);

  if (entries.some((entry) => entry.md5 === archiveInfo.md5)) {
    return;
  }

  const entry: ManifestEntry = {
    md5: archiveInfo.md5,
    lastModified: archiveInfo.lastModified.toISOString(),
    sizeBytes: archiveInfo.sizeBytes,
    ingestedAt: new Date().toISOString(),
    archiveName,
  };
  entries.push(entry);

  await writeEntries(POLICE_UK_MANIFEST_PATH, entries);
}

export async function hasIngestedMetRelease(key: string): Promise<boolean> {
  const entries = await readEntries<MetManifestEntry>(MET_MANIFEST_PATH);
  return entries.some(
    (entry) => metReleaseKey(entry.recentHash, entry.historicalHash) === key,
  );
}

export async function writeMetRelease(release: MetRelease): Promise<void> {
  const entries = await readEntries<MetManifestEntry>(MET_MANIFEST_PATH);
  const key = metReleaseKey(
    release.recent.checkHash,
    release.historical.checkHash,
  );
  if (
    entries.some(
      (entry) => metReleaseKey(entry.recentHash, entry.historicalHash) === key,
    )
  ) {
    return;
  }
  entries.push({
    releaseDate: release.releaseDate,
    recentHash: release.recent.checkHash,
    historicalHash: release.historical.checkHash,
    recentSize: release.recent.checkSize,
    historicalSize: release.historical.checkSize,
    ingestedAt: new Date().toISOString(),
  });
  await writeEntries(MET_MANIFEST_PATH, entries);
}

export function onsLayerKey(
  layerName: string,
  dataLastEditDate: Date,
): string {
  return `${layerName}+${dataLastEditDate.toISOString()}`;
}

export async function hasIngestedOnsLayer(key: string): Promise<boolean> {
  const entries = await readEntries<OnsManifestEntry>(ONS_MANIFEST_PATH);
  return entries.some(
    (entry) => onsLayerKey(entry.layerName, new Date(entry.dataLastEditDate)) === key,
  );
}

export async function writeOnsLayer(
  layerName: string,
  dataLastEditDate: Date,
): Promise<void> {
  const entries = await readEntries<OnsManifestEntry>(ONS_MANIFEST_PATH);
  const key = onsLayerKey(layerName, dataLastEditDate);
  if (
    entries.some(
      (entry) =>
        onsLayerKey(entry.layerName, new Date(entry.dataLastEditDate)) === key,
    )
  ) {
    return;
  }
  entries.push({
    layerName,
    dataLastEditDate: dataLastEditDate.toISOString(),
    ingestedAt: new Date().toISOString(),
  });
  await writeEntries(ONS_MANIFEST_PATH, entries);
}
