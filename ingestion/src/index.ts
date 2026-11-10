import { ingestArchive } from "./ingestArchive.js";
import { ingestMet } from "./ingestMet.js";
import { ingestNomisPopulation } from "./ingestNomisPopulation.js";
import { ingestImd } from "./ingestImd.js";
import { ingestOnsGeography } from "./ingestOnsGeography.js";
import { ingestTfl } from "./ingestTfl.js";
import { ingestGreenspace } from "./ingestGreenspace.js";
import { ingestNaptan } from "./ingestNaptan.js";
import {
  archiveUrl,
  BACKFILL_ARCHIVES,
  LATEST_ARCHIVE_URL,
} from "./sources/policeUk.js";

const sources: [string, () => Promise<void>][] = [
  ...BACKFILL_ARCHIVES.map((month): [string, () => Promise<void>] => [
    `police_uk ${month}`,
    () => ingestArchive(archiveUrl(month), month),
  ]),
  ["police_uk latest", () => ingestArchive(LATEST_ARCHIVE_URL, "latest")],
  ["met", ingestMet],
  ["ons geography", ingestOnsGeography],
  ["nomis population", ingestNomisPopulation],
  ["imd", ingestImd],
  ["tfl", ingestTfl],
  ["greenspace", ingestGreenspace],
  ["naptan rail", ingestNaptan],
];

const failed: string[] = [];
for (const [name, ingest] of sources) {
  try {
    await ingest();
  } catch (error) {
    console.error(`${name}: failed`, error);
    failed.push(name);
  }
}

if (failed.length > 0) {
  console.error(`failed sources: ${failed.join(", ")}`);
  process.exitCode = 1;
}
