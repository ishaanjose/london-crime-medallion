import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { isFileNotFound } from "./fsUtils.js";
import { MANIFEST_PATH } from "./paths.js";
import type { ArchiveInfo } from "./sources/policeUk.js";

const TEMP_MANIFEST_PATH = `${MANIFEST_PATH}.tmp`;

interface ManifestEntry {
  md5: string;
  lastModified: string;
  sizeBytes: number;
  ingestedAt: string;
  archiveName: string;
}

function parseManifest(contents: string): ManifestEntry[] {
  const manifest: unknown = JSON.parse(contents);
  if (!Array.isArray(manifest)) {
    throw new Error("Manifest must contain an array");
  }
  return manifest as ManifestEntry[];
}

async function readEntries(): Promise<ManifestEntry[]> {
  try {
    return parseManifest(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    if (isFileNotFound(error)) {
      return [];
    }
    throw error;
  }
}

export async function hasIngested(md5: string): Promise<boolean> {
  const entries = await readEntries();
  return entries.some((entry) => entry.md5 === md5);
}

export async function writeArchiveInfo(
  archiveInfo: ArchiveInfo,
  archiveName: string,
): Promise<void> {
  const entries = await readEntries();

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

  await mkdir(dirname(MANIFEST_PATH), { recursive: true });
  await writeFile(
    TEMP_MANIFEST_PATH,
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );
  await rename(TEMP_MANIFEST_PATH, MANIFEST_PATH);
}
