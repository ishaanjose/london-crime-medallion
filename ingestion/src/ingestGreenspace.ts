import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { downloadFile } from "./download.js";
import { extractMatching } from "./extract.js";
import { landGreenspace } from "./landGreenspace.js";
import {
  hasIngestedGreenspace,
  writeGreenspace,
} from "./manifest.js";
import { DOWNLOADS_DIR, EXTRACT_DIR } from "./paths.js";
import { getGreenspaceDownload } from "./sources/osGreenspace.js";

export async function ingestGreenspace(): Promise<void> {
  const download = await getGreenspaceDownload();
  if (await hasIngestedGreenspace(download.version, download.md5)) {
    console.log(`greenspace ${download.version}: up to date`);
    return;
  }

  const zipPath = join(
    DOWNLOADS_DIR,
    `os_greenspace-${download.version}.zip`,
  );
  await downloadFile(
    download.url,
    zipPath,
    download.size,
    "greenspace",
    download.md5,
  );

  const extracted = await extractMatching(
    zipPath,
    join(EXTRACT_DIR, "os_greenspace"),
    /^Data\/[^/]+\.gpkg$/,
  );
  if (extracted.length !== 1) {
    throw new Error(
      `Expected exactly one Greenspace GeoPackage, found ${extracted.length}`,
    );
  }

  const batchId = randomUUID();
  await landGreenspace(extracted[0]!, download.version, batchId);
  await writeGreenspace(download.version, download.md5, download.size, batchId);
}
