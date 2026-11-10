import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { downloadFile } from "./download.js";
import { landMetRelease } from "./landMetToBronze.js";
import {
  hasIngestedMetRelease,
  metReleaseKey,
  writeMetRelease,
} from "./manifest.js";
import { DOWNLOADS_DIR } from "./paths.js";
import { getLatestMetRelease } from "./sources/metDatastore.js";

export async function ingestMet(): Promise<void> {
  const release = await getLatestMetRelease();
  const key = metReleaseKey(
    release.recent.checkHash,
    release.historical.checkHash,
  );
  if (await hasIngestedMetRelease(key)) {
    console.log(`met ${release.releaseDate}: up to date`);
    return;
  }

  const batchId = randomUUID();
  const releaseDir = join(DOWNLOADS_DIR, "met", release.releaseDate);

  const recentPath = join(releaseDir, "recent.csv");
  await downloadFile(
    release.recent.url,
    recentPath,
    release.recent.checkSize,
    "met recent",
  );
  const historicalPath = join(releaseDir, "historical.csv");
  await downloadFile(
    release.historical.url,
    historicalPath,
    release.historical.checkSize,
    "met historical",
  );

  await landMetRelease(
    [
      { kind: "recent", csvPath: recentPath },
      { kind: "historical", csvPath: historicalPath },
    ],
    release.releaseDate,
    batchId,
  );
  await writeMetRelease(release);
  await rm(releaseDir, { recursive: true, force: true });
}
