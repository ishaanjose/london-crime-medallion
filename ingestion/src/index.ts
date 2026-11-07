import { rm } from "node:fs/promises";
import { join } from "node:path";

import { extractLondonFiles, getArchiveMonth } from "./extract.js";
import { landToBronze } from "./landToBronze.js";
import { readLastArchiveInfo, writeArchiveInfo } from "./manifest.js";
import { DOWNLOADS_DIR, EXTRACT_DIR } from "./paths.js";
import {
  downloadArchive,
  getArchiveInfo,
  LATEST_ARCHIVE_URL,
} from "./sources/policeUk.js";

const archivePath = join(DOWNLOADS_DIR, "latest.zip");
const extractDir = join(EXTRACT_DIR, "latest");
const latestArchiveInfo = await getArchiveInfo(LATEST_ARCHIVE_URL);
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
  await writeArchiveInfo(latestArchiveInfo, archiveName);
  await rm(EXTRACT_DIR, { recursive: true, force: true });
  await rm(archivePath, { force: true });
}
