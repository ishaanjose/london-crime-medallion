import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR = fileURLToPath(new URL("../../data/", import.meta.url));
export const DOWNLOADS_DIR = join(DATA_DIR, "_downloads");
export const EXTRACT_DIR = join(DOWNLOADS_DIR, "extracted");
export const POLICE_UK_MANIFEST_PATH = join(
  DATA_DIR,
  "bronze/police_uk/_manifest.json",
);
export const MET_MANIFEST_PATH = join(
  DATA_DIR,
  "bronze/met_datastore/_manifest.json",
);
export const ONS_MANIFEST_PATH = join(
  DATA_DIR,
  "bronze/ons_geography/_manifest.json",
);
export const NOMIS_MANIFEST_PATH = join(
  DATA_DIR,
  "bronze/nomis/_manifest.json",
);
export const IMD_MANIFEST_PATH = join(
  DATA_DIR,
  "bronze/mhclg_imd/_manifest.json",
);
export const TFL_MANIFEST_PATH = join(DATA_DIR, "bronze/tfl/_manifest.json");
export const GREENSPACE_MANIFEST_PATH = join(
  DATA_DIR,
  "bronze/os_open_greenspace/_manifest.json",
);
