import { join } from "node:path";

import { downloadFile } from "./download.js";
import { DOWNLOADS_DIR } from "./paths.js";
import { getLatestMetRelease } from "./sources/metDatastore.js";

export async function ingestMet(): Promise<void> {
  const release = await getLatestMetRelease();
  const releaseDir = join(DOWNLOADS_DIR, "met", release.releaseDate);

  await downloadFile(
    release.recent.url,
    join(releaseDir, "recent.csv"),
    release.recent.checkSize,
    "met recent",
  );
  await downloadFile(
    release.historical.url,
    join(releaseDir, "historical.csv"),
    release.historical.checkSize,
    "met historical",
  );
}
