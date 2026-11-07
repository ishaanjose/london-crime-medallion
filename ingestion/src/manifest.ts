import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { MANIFEST_PATH } from "./paths.js";
import type { ArchiveInfo } from "./sources/policeUk.js";

const TEMP_MANIFEST_PATH = `${MANIFEST_PATH}.tmp`;

interface ManifestEntry {
  md5: string;
  lastModified: string;
  sizeBytes: number;
  ingestedAt: string;
}

function toArchiveInfo(entry: ManifestEntry): ArchiveInfo {
  const lastModified = new Date(entry.lastModified);
  if (Number.isNaN(lastModified.getTime())) {
    throw new Error("Manifest contains an invalid lastModified date");
  }

  return {
    md5: entry.md5,
    lastModified,
    sizeBytes: entry.sizeBytes,
  };
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
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function readLastArchiveInfo(): Promise<ArchiveInfo | null> {
  const entries = await readEntries();
  const lastEntry = entries.at(-1);
  return lastEntry ? toArchiveInfo(lastEntry) : null;
}

export async function writeArchiveInfo(
  archiveInfo: ArchiveInfo,
): Promise<void> {
  const entries = await readEntries();

  if (entries.at(-1)?.md5 === archiveInfo.md5) {
    return;
  }

  const entry: ManifestEntry = {
    md5: archiveInfo.md5,
    lastModified: archiveInfo.lastModified.toISOString(),
    sizeBytes: archiveInfo.sizeBytes,
    ingestedAt: new Date().toISOString(),
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
