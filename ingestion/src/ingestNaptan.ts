import { randomUUID } from "node:crypto";

import { md5OfText } from "./checksum.js";
import { landRailStations } from "./landNaptan.js";
import { hasIngestedNaptan, writeNaptan } from "./manifest.js";
import { fetchRailStations } from "./sources/naptan.js";

export async function ingestNaptan(): Promise<void> {
  const { text, rows } = await fetchRailStations();
  const md5 = md5OfText(text);
  if (await hasIngestedNaptan(md5)) {
    console.log("naptan rail: unchanged");
    return;
  }

  const batchId = randomUUID();
  await landRailStations(text, new Date().toISOString().slice(0, 10), batchId);
  await writeNaptan(md5, rows, batchId);
  console.log(`naptan rail: ${rows} rail stations`);
}
