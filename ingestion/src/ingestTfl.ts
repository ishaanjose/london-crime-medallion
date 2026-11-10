import { randomUUID } from "node:crypto";

import { md5OfJson } from "./checksum.js";
import { landStopPoints } from "./landTfl.js";
import {
  hasIngestedTflSnapshot,
  writeTflSnapshot,
} from "./manifest.js";
import { fetchStopPoints, TFL_MODES } from "./sources/tfl.js";

export async function ingestTfl(): Promise<void> {
  for (const mode of TFL_MODES) {
    const { text, count } = await fetchStopPoints(mode);
    const md5 = md5OfJson(text);
    if (await hasIngestedTflSnapshot(mode, md5)) {
      console.log(`tfl ${mode}: unchanged`);
      continue;
    }

    await landStopPoints(mode, text, new Date().toISOString().slice(0, 10));
    await writeTflSnapshot(mode, md5, count, randomUUID());
    console.log(`tfl ${mode}: ${count} stop points`);
  }
}
