import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
export const DOWNLOADS_DIR = join(DATA_DIR, "_downloads");
export const EXTRACT_DIR = join(DOWNLOADS_DIR, "extracted");
export const MANIFEST_PATH = join(
  DATA_DIR,
  "bronze/police_uk/_manifest.json",
);
