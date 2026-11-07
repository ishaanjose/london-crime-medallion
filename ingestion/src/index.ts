import { join } from "node:path";

import { extractLondonFiles, getArchiveMonth } from "./extract.js";
import { landToBronze } from "./landToBronze.js";
import { readLastArchiveInfo } from "./manifest.js";
import { DOWNLOADS_DIR, EXTRACT_DIR } from "./paths.js";
import {
  downloadArchive,
  getLatestArchiveInfo,
  LATEST_ARCHIVE_URL,
} from "./sources/policeUk.js";

const archivePath = join(DOWNLOADS_DIR, "test.zip");
const extractDir = join(EXTRACT_DIR, "test");
const latestArchiveInfo = await getLatestArchiveInfo();
const lastArchiveInfo = await readLastArchiveInfo();

if (lastArchiveInfo?.md5 === latestArchiveInfo.md5) {
  console.log("up to date");
} else {
  console.log("new archive, needs ingesting");
  await downloadArchive(
    LATEST_ARCHIVE_URL,
    archivePath,
    latestArchiveInfo.sizeBytes,
    latestArchiveInfo.md5,
  );

  const extractedPaths = await extractLondonFiles(archivePath, extractDir);
  console.log(`extracted ${extractedPaths.length} files`);

  const archiveName = await getArchiveMonth(extractDir);
  await landToBronze(extractDir, archiveName, "street");
  await landToBronze(extractDir, archiveName, "outcomes");
}
