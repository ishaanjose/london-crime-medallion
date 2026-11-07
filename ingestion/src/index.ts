import { join } from "node:path";

import { readLastArchiveInfo } from "./manifest.js";
import { DOWNLOADS_DIR } from "./paths.js";
import {
  downloadArchive,
  getLatestArchiveInfo,
  LATEST_ARCHIVE_URL,
} from "./sources/policeUk.js";

const latestArchiveInfo = await getLatestArchiveInfo();
const lastArchiveInfo = await readLastArchiveInfo();

if (lastArchiveInfo?.md5 === latestArchiveInfo.md5) {
  console.log("up to date");
} else {
  console.log("new archive, needs ingesting");
  await downloadArchive(
    LATEST_ARCHIVE_URL,
    join(DOWNLOADS_DIR, "test.zip"),
    latestArchiveInfo.sizeBytes,
    latestArchiveInfo.md5,
  );
}
