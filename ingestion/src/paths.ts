import { fileURLToPath } from "node:url";

export const DATA_DIR = fileURLToPath(
  new URL("../../data/", import.meta.url),
);
export const DOWNLOADS_DIR = fileURLToPath(
  new URL("../../data/_downloads/", import.meta.url),
);
export const MANIFEST_PATH = fileURLToPath(
  new URL("../../data/bronze/police_uk/_manifest.json", import.meta.url),
);
