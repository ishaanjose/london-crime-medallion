import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

import { isFileNotFound } from "./fsUtils.js";
import { md5OfFile } from "./checksum.js";

export async function downloadFile(
  url: string,
  destPath: string,
  expectedSize: number,
  label: string,
  expectedMd5?: string,
): Promise<void> {
  try {
    if (expectedMd5) {
      if ((await md5OfFile(destPath)) === expectedMd5) {
        console.log(`${label}: already downloaded`);
        return;
      }
    } else if ((await stat(destPath)).size === expectedSize) {
      console.log(`${label}: already downloaded`);
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
      `Failed to download file: ${response.status} ${response.statusText}`,
    );
  }
  if (!response.body) {
    throw new Error("File response has no body");
  }

  await mkdir(dirname(destPath), { recursive: true });

  const file = Readable.fromWeb(response.body as ReadableStream);
  const partPath = `${destPath}.part`;
  let downloadedSize = 0;
  let nextProgress = 5;

  try {
    await pipeline(
      file,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          downloadedSize += chunk.length;
          const progress = (downloadedSize / expectedSize) * 100;
          while (progress >= nextProgress && nextProgress <= 100) {
            console.log(`${label}: ${nextProgress}%`);
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
        `Downloaded file size mismatch: expected ${expectedSize}, got ${size}`,
      );
    }

    if (expectedMd5) {
      const md5 = await md5OfFile(partPath);
      if (md5 !== expectedMd5) {
        throw new Error(
          `Downloaded file MD5 mismatch: expected ${expectedMd5}, got ${md5}`,
        );
      }
    }

    await rename(partPath, destPath);
  } catch (error) {
    await rm(partPath, { force: true });
    throw error;
  }
}
