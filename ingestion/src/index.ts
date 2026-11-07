import { ingestArchive } from "./ingestArchive.js";
import { LATEST_ARCHIVE_URL } from "./sources/policeUk.js";

await ingestArchive(LATEST_ARCHIVE_URL, "latest");
