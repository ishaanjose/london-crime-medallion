import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { downloadFile } from "./download.js";
import { extractLondonFiles, getArchiveMonth } from "./extract.js";
import { landToBronze } from "./landToBronze.js";
import { hasIngested, writeArchiveInfo } from "./manifest.js";
import { DOWNLOADS_DIR, EXTRACT_DIR } from "./paths.js";
import { getArchiveInfo } from "./sources/policeUk.js";

export async function ingestArchive(
  url: string,
  name: string,
): Promise<void> {
  const archiveInfo = await getArchiveInfo(url);
  if (await hasIngested(archiveInfo.md5)) {
    console.log(`${name}: up to date`);
    return;
  }

  console.log(`${name}: new archive, needs ingesting`);

  const archivePath = join(DOWNLOADS_DIR, `${name}.zip`);
  const extractDir = join(EXTRACT_DIR, name);
  await downloadFile(
    url,
    archivePath,
    archiveInfo.sizeBytes,
    name,
    archiveInfo.md5,
  );

  const extractedPaths = await extractLondonFiles(archivePath, extractDir);
  console.log(`${name}: extracted ${extractedPaths.length} files`);

  const archiveName = await getArchiveMonth(extractDir);
  const batchId = randomUUID();
  await landToBronze(extractDir, archiveName, "street", batchId);
  await landToBronze(extractDir, archiveName, "outcomes", batchId);
  await writeArchiveInfo(archiveInfo, archiveName);
  await rm(extractDir, { recursive: true, force: true });
  await rm(archivePath, { force: true });
}
