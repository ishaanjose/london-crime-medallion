import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { downloadFile } from "./download.js";
import { landMetToBronze } from "./landMetToBronze.js";
import { DOWNLOADS_DIR } from "./paths.js";
import { getLatestMetRelease } from "./sources/metDatastore.js";

export async function ingestMet(): Promise<void> {
  const release = await getLatestMetRelease();
  const batchId = randomUUID();
  const releaseDir = join(DOWNLOADS_DIR, "met", release.releaseDate);

  const recentPath = join(releaseDir, "recent.csv");
  await downloadFile(
    release.recent.url,
    recentPath,
    release.recent.checkSize,
    "met recent",
  );
  await landMetToBronze(recentPath, release.releaseDate, "recent", batchId);

  const historicalPath = join(releaseDir, "historical.csv");
  await downloadFile(
    release.historical.url,
    historicalPath,
    release.historical.checkSize,
    "met historical",
  );
  await landMetToBronze(
    historicalPath,
    release.releaseDate,
    "historical",
    batchId,
  );
}
