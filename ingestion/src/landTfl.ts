import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DATA_DIR } from "./paths.js";

export async function landStopPoints(
  mode: string,
  text: string,
  snapshotDate: string,
): Promise<void> {
  const dir = join(
    DATA_DIR,
    "bronze/tfl/stop_points",
    `mode=${mode}`,
    `snapshot=${snapshotDate}`,
  );
  const path = join(dir, "stop_points.json");
  const tempPath = `${path}.tmp`;

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(tempPath, text, "utf8");
    await rename(tempPath, path);
  } finally {
    await rm(tempPath, { force: true });
  }
}
