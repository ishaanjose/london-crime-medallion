import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isFileNotFound } from "./fsUtils.js";
import {
  MET_MANIFEST_PATH,
  IMD_MANIFEST_PATH,
  NOMIS_MANIFEST_PATH,
  ONS_MANIFEST_PATH,
  POLICE_UK_MANIFEST_PATH,
  TFL_MANIFEST_PATH,
  GREENSPACE_MANIFEST_PATH,
  NAPTAN_MANIFEST_PATH,
} from "./paths.js";
import type { MetRelease } from "./sources/metDatastore.js";
import type { ArchiveInfo } from "./sources/policeUk.js";
import type { ImdFileInfo } from "./sources/mhclgImd.js";

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

interface NomisManifestEntry {
  dataset: "NM_2014_1";
  lastUpdated: string;
  batchId: string;
  ingestedAt: string;
}

interface ImdManifestEntry {
  release: string;
  etag: string;
  lastModified: string;
  size: number;
  batchId: string;
  ingestedAt: string;
}

interface TflManifestEntry {
  mode: string;
  md5: string;
  count: number;
  batchId: string;
  ingestedAt: string;
}

interface GreenspaceManifestEntry {
  version: string;
  md5: string;
  size: number;
  batchId: string;
  ingestedAt: string;
}

interface NaptanManifestEntry {
  md5: string;
  rows: number;
  batchId: string;
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

export async function hasIngestedNomisRelease(
  lastUpdated: string,
): Promise<boolean> {
  const entries = await readEntries<NomisManifestEntry>(NOMIS_MANIFEST_PATH);
  return entries.some(
    (entry) => entry.dataset === "NM_2014_1" && entry.lastUpdated === lastUpdated,
  );
}

export async function writeNomisRelease(
  lastUpdated: string,
  batchId: string,
): Promise<void> {
  const entries = await readEntries<NomisManifestEntry>(NOMIS_MANIFEST_PATH);
  if (
    entries.some(
      (entry) => entry.dataset === "NM_2014_1" && entry.lastUpdated === lastUpdated,
    )
  ) {
    return;
  }
  entries.push({
    dataset: "NM_2014_1",
    lastUpdated,
    batchId,
    ingestedAt: new Date().toISOString(),
  });
  await writeEntries(NOMIS_MANIFEST_PATH, entries);
}

export async function hasIngestedImdFile(
  release: string,
  etag: string,
): Promise<boolean> {
  const entries = await readEntries<ImdManifestEntry>(IMD_MANIFEST_PATH);
  return entries.some(
    (entry) => entry.release === release && entry.etag === etag,
  );
}

export async function writeImdFile(
  release: string,
  info: ImdFileInfo,
  batchId: string,
): Promise<void> {
  const entries = await readEntries<ImdManifestEntry>(IMD_MANIFEST_PATH);
  if (
    entries.some(
      (entry) => entry.release === release && entry.etag === info.etag,
    )
  ) {
    return;
  }
  entries.push({
    release,
    etag: info.etag,
    lastModified: info.lastModified.toISOString(),
    size: info.size,
    batchId,
    ingestedAt: new Date().toISOString(),
  });
  await writeEntries(IMD_MANIFEST_PATH, entries);
}

export async function hasIngestedTflSnapshot(
  mode: string,
  md5: string,
): Promise<boolean> {
  const entries = await readEntries<TflManifestEntry>(TFL_MANIFEST_PATH);
  return entries.some((entry) => entry.mode === mode && entry.md5 === md5);
}

export async function writeTflSnapshot(
  mode: string,
  md5: string,
  count: number,
  batchId: string,
): Promise<void> {
  const entries = await readEntries<TflManifestEntry>(TFL_MANIFEST_PATH);
  if (entries.some((entry) => entry.mode === mode && entry.md5 === md5)) {
    return;
  }
  entries.push({
    mode,
    md5,
    count,
    batchId,
    ingestedAt: new Date().toISOString(),
  });
  await writeEntries(TFL_MANIFEST_PATH, entries);
}

export async function hasIngestedGreenspace(
  version: string,
  md5: string,
): Promise<boolean> {
  const entries = await readEntries<GreenspaceManifestEntry>(
    GREENSPACE_MANIFEST_PATH,
  );
  return entries.some(
    (entry) => entry.version === version && entry.md5 === md5,
  );
}

export async function writeGreenspace(
  version: string,
  md5: string,
  size: number,
  batchId: string,
): Promise<void> {
  const entries = await readEntries<GreenspaceManifestEntry>(
    GREENSPACE_MANIFEST_PATH,
  );
  if (entries.some((entry) => entry.version === version && entry.md5 === md5)) {
    return;
  }
  entries.push({
    version,
    md5,
    size,
    batchId,
    ingestedAt: new Date().toISOString(),
  });
  await writeEntries(GREENSPACE_MANIFEST_PATH, entries);
}

export async function hasIngestedNaptan(md5: string): Promise<boolean> {
  const entries = await readEntries<NaptanManifestEntry>(NAPTAN_MANIFEST_PATH);
  return entries.some((entry) => entry.md5 === md5);
}

export async function writeNaptan(
  md5: string,
  rows: number,
  batchId: string,
): Promise<void> {
  const entries = await readEntries<NaptanManifestEntry>(NAPTAN_MANIFEST_PATH);
  if (entries.some((entry) => entry.md5 === md5)) {
    return;
  }
  entries.push({
    md5,
    rows,
    batchId,
    ingestedAt: new Date().toISOString(),
  });
  await writeEntries(NAPTAN_MANIFEST_PATH, entries);
}
