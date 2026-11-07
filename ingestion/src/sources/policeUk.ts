import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

import { isFileNotFound } from "../fsUtils.js";
import { md5OfFile } from "../checksum.js";
import { withRetry } from "../retry.js";

export const LATEST_ARCHIVE_URL =
  "https://data.police.uk/data/archive/latest.zip";

export function archiveUrl(month: string): string {
  return `https://data.police.uk/data/archive/${month}.zip`;
}

// These snapshots, together with latest, cover December 2010 to the present.
export const BACKFILL_ARCHIVES = ["2017-04", "2017-09", "2020-09", "2023-09"];

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

export async function downloadArchive(
  url: string,
  destPath: string,
  expectedSize: number,
  expectedMd5: string,
): Promise<void> {
  try {
    if ((await md5OfFile(destPath)) === expectedMd5) {
      console.log("already downloaded");
      return;
    }
  } catch (error) {
    if (!isFileNotFound(error)) {
      throw error;
    }
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download archive: ${response.status} ${response.statusText}`,
    );
  }
  if (!response.body) {
    throw new Error("Archive response has no body");
  }

  await mkdir(dirname(destPath), { recursive: true });

  const archive = Readable.fromWeb(response.body as ReadableStream);
  const partPath = `${destPath}.part`;
  let downloadedSize = 0;
  let nextProgress = 5;

  try {
    await pipeline(
      archive,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          downloadedSize += chunk.length;
          const progress = (downloadedSize / expectedSize) * 100;
          while (progress >= nextProgress && nextProgress <= 100) {
            console.log(`${nextProgress}%`);
            nextProgress += 5;
          }
          yield chunk;
        }
      },
      createWriteStream(partPath),
    );

    const { size } = await stat(partPath);
    if (size !== expectedSize) {
      throw new Error(
        `Downloaded archive size mismatch: expected ${expectedSize}, got ${size}`,
      );
    }

    const md5 = await md5OfFile(partPath);
    if (md5 !== expectedMd5) {
      throw new Error(
        `Downloaded archive MD5 mismatch: expected ${expectedMd5}, got ${md5}`,
      );
    }

    await rename(partPath, destPath);
  } catch (error) {
    await rm(partPath, { force: true });
    throw error;
  }
}
