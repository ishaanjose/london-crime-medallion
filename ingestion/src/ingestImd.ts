import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { downloadFile } from "./download.js";
import { landImd } from "./landImd.js";
import {
  hasIngestedImdFile,
  writeImdFile,
} from "./manifest.js";
import { DOWNLOADS_DIR } from "./paths.js";
import {
  getImdFileInfo,
  IMD_RELEASES,
} from "./sources/mhclgImd.js";

export async function ingestImd(): Promise<void> {
  for (const { release, url } of IMD_RELEASES) {
    const info = await getImdFileInfo(url);
    if (await hasIngestedImdFile(release, info.etag)) {
      console.log(`${release}: up to date`);
      continue;
    }

    const csvPath = join(DOWNLOADS_DIR, `${release}-${info.etag}.csv`);
    await downloadFile(url, csvPath, info.size, release);
    const batchId = randomUUID();
    await landImd(csvPath, release, batchId);
    await writeImdFile(release, info, batchId);
  }
}
