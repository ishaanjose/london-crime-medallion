import { ingestArchive } from "./ingestArchive.js";
import { ingestMet } from "./ingestMet.js";
import {
  archiveUrl,
  BACKFILL_ARCHIVES,
  LATEST_ARCHIVE_URL,
} from "./sources/policeUk.js";

for (const month of BACKFILL_ARCHIVES) {
  await ingestArchive(archiveUrl(month), month);
}
await ingestArchive(LATEST_ARCHIVE_URL, "latest");
await ingestMet();
