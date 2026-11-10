import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { landPopulation } from "./landNomisPopulation.js";
import {
  hasIngestedNomisRelease,
  writeNomisRelease,
} from "./manifest.js";
import { DOWNLOADS_DIR } from "./paths.js";
import {
  fetchPopulationPages,
  getPopulationInfo,
} from "./sources/nomisPopulation.js";

export async function ingestNomisPopulation(): Promise<void> {
  const { lastUpdated } = await getPopulationInfo();
  if (await hasIngestedNomisRelease(lastUpdated)) {
    console.log(
      `population: release ${lastUpdated} already ingested, skipping`,
    );
    return;
  }

  const batchId = randomUUID();
  const pages = await fetchPopulationPages(
    join(DOWNLOADS_DIR, "nomis_population"),
  );
  await landPopulation(pages, lastUpdated, batchId);
  await writeNomisRelease(lastUpdated, batchId);
}
