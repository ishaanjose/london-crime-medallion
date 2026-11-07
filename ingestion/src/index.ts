import { readLastArchiveInfo } from "./manifest.js";
import { getLatestArchiveInfo } from "./sources/policeUk.js";

const latestArchiveInfo = await getLatestArchiveInfo();
const lastArchiveInfo = await readLastArchiveInfo();

console.log(
  lastArchiveInfo?.md5 === latestArchiveInfo.md5
    ? "up to date"
    : "new archive, needs ingesting",
);
