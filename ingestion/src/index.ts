import { ingestArchive } from "./ingestArchive.js";
import { ingestMet } from "./ingestMet.js";
import { ingestNomisPopulation } from "./ingestNomisPopulation.js";
import { ingestImd } from "./ingestImd.js";
import { ingestOnsGeography } from "./ingestOnsGeography.js";
import { ingestTfl } from "./ingestTfl.js";
import { ingestGreenspace } from "./ingestGreenspace.js";
import { ingestNaptan } from "./ingestNaptan.js";
import { missingArchivesMessage, planBackfill } from "./policeUkBackfill.js";
import { archiveUrl, LATEST_ARCHIVE_URL } from "./sources/policeUk.js";

const failed: string[] = [];

let backfillToIngest: string[] = [];
try {
  const backfill = await planBackfill();
  for (const month of backfill.upToDate) {
    console.log(`police_uk ${month}: up to date`);
  }
  if (backfill.missing.length > 0) {
    console.error(`police_uk backfill: ${missingArchivesMessage(backfill.missing)}`);
    failed.push(...backfill.missing.map((month) => `police_uk ${month}`));
  }
  backfillToIngest = backfill.toIngest;
} catch (error) {
  console.error("police_uk backfill: failed", error);
  failed.push("police_uk backfill");
}

const sources: [string, () => Promise<void>][] = [
  ...backfillToIngest.map((month): [string, () => Promise<void>] => [
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
