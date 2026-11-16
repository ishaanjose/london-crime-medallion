// Read-only check of every upstream source. Prints OK or FAIL per source and
// exits non-zero on any FAIL. Reads bronze manifests but never writes anything.
import { getLatestMetRelease } from "./sources/metDatastore.js";
import { getImdFileInfo, IMD_RELEASES } from "./sources/mhclgImd.js";
import { fetchRailStations } from "./sources/naptan.js";
import {
  getLatestPopulationYear,
  getPopulationInfo,
  NOMIS_FIRST_YEAR,
  populationUrl,
} from "./sources/nomisPopulation.js";
import {
  arcgisSearchUrl,
  getLayerInfo,
  ONS_LAYER_SOURCES,
} from "./sources/onsGeography.js";
import type { OnsLayerSource } from "./sources/onsGeography.js";
import { getGreenspaceDownload } from "./sources/osGreenspace.js";
import {
  ARCHIVE_LIST_URL,
  archiveUrl,
  BACKFILL_ARCHIVES,
  getArchiveInfo,
  getHostedArchiveMonths,
  LATEST_ARCHIVE_URL,
} from "./sources/policeUk.js";
import { fetchStopPoints, TFL_MODES } from "./sources/tfl.js";
import { archiveInBronze, missingArchivesMessage } from "./policeUkBackfill.js";

const NOMIS_COLUMNS = "DATE,GEOGRAPHY_CODE,GEOGRAPHY_NAME,OBS_VALUE";

class CheckFailure extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}

const failures: string[] = [];

async function check(name: string, run: () => Promise<string>): Promise<void> {
  try {
    const detail = await run();
    console.log(`OK    ${name}: ${detail}`);
  } catch (error) {
    failures.push(name);
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL  ${name}: ${message}`);
    if (error instanceof CheckFailure && error.hint) {
      console.log(`      ${error.hint}`);
    }
  }
}

async function countFeatures(layerUrl: string): Promise<number> {
  const params = new URLSearchParams({
    where: "1=1",
    returnCountOnly: "true",
    f: "json",
  });
  const response = await fetch(`${layerUrl}/query?${params}`);
  if (!response.ok) {
    throw new Error(`count request returned ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as { count?: unknown; error?: unknown };
  if (data.error !== undefined) {
    throw new Error(`count request returned an error: ${JSON.stringify(data.error)}`);
  }
  if (typeof data.count !== "number") {
    throw new Error("count response has no count");
  }
  return data.count;
}

async function checkOnsLayer(layer: OnsLayerSource): Promise<string> {
  const searchHint = `search: ${arcgisSearchUrl(layer.searchTerms)}`;
  try {
    const info = await getLayerInfo(layer.url);
    const missing = layer.requiredFields.filter((field) =>
      typeof field === "string"
        ? !info.fields.includes(field)
        : !info.fields.some((name) => field.test(name)),
    );
    if (missing.length > 0) {
      throw new Error(`missing fields ${missing.map(String).join(", ")}`);
    }
    const count = await countFeatures(layer.url);
    if (count < layer.minCount || count > layer.maxCount) {
      const expected =
        layer.minCount === layer.maxCount
          ? `${layer.minCount}`
          : `${layer.minCount}-${layer.maxCount}`;
      throw new Error(`${count} records, expected ${expected}`);
    }
    return `${count} records, fields ok, data edited ${info.dataLastEditDate.toISOString().slice(0, 10)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CheckFailure(`${layer.url}: ${message}`, searchHint);
  }
}

async function checkPoliceArchives(): Promise<string> {
  const hosted = await getHostedArchiveMonths();
  const notHosted = BACKFILL_ARCHIVES.filter((month) => !hosted.has(month));
  const missing: string[] = [];
  const keptInBronze: string[] = [];
  for (const month of notHosted) {
    (await archiveInBronze(month) ? keptInBronze : missing).push(month);
  }
  if (missing.length > 0) {
    throw new Error(missingArchivesMessage(missing));
  }
  const months = [...hosted].sort();
  const note =
    keptInBronze.length > 0
      ? `; no longer hosted but in bronze: ${keptInBronze.join(", ")}`
      : "";
  return `${BACKFILL_ARCHIVES.length - notHosted.length}/${BACKFILL_ARCHIVES.length} backfill archives hosted (${ARCHIVE_LIST_URL} lists ${months[0]} to ${months.at(-1)})${note}`;
}

async function checkPoliceArchiveHeaders(url: string): Promise<string> {
  const info = await getArchiveInfo(url);
  return `${(info.sizeBytes / 1e9).toFixed(2)} GB, md5 ${info.md5}, modified ${info.lastModified.toISOString().slice(0, 10)}`;
}

async function checkNomis(): Promise<string> {
  const { lastUpdated } = await getPopulationInfo();
  const latestYear = await getLatestPopulationYear();
  const url = new URL(populationUrl(0, `${NOMIS_FIRST_YEAR}-${latestYear}`));
  url.searchParams.set("recordlimit", "5");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`data request returned ${response.status} ${response.statusText}`);
  }
  const lines = (await response.text())
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");
  const header = lines[0]?.replaceAll('"', "");
  if (header !== NOMIS_COLUMNS) {
    throw new Error(`data header is ${header ?? "empty"}, expected ${NOMIS_COLUMNS}`);
  }
  if (lines.length < 2) {
    throw new Error("data request returned no rows");
  }
  return `years ${NOMIS_FIRST_YEAR}-${latestYear}, last updated ${lastUpdated}, data request ok`;
}

for (const layer of ONS_LAYER_SOURCES) {
  await check(`arcgis ${layer.name}`, () => checkOnsLayer(layer));
}

for (const { release, url } of IMD_RELEASES) {
  await check(`imd ${release}`, async () => {
    const info = await getImdFileInfo(url);
    return `${info.size} bytes, etag ${info.etag}`;
  });
}

await check("police.uk archive list", checkPoliceArchives);
await check("police.uk latest.zip", () =>
  checkPoliceArchiveHeaders(LATEST_ARCHIVE_URL),
);
await check(`police.uk ${BACKFILL_ARCHIVES[0]}.zip`, () =>
  checkPoliceArchiveHeaders(archiveUrl(BACKFILL_ARCHIVES[0]!)),
);

await check("nomis NM_2014_1", checkNomis);

for (const mode of TFL_MODES) {
  await check(`tfl ${mode}`, async () => {
    const { count } = await fetchStopPoints(mode);
    return `${count} stop points`;
  });
}

await check("naptan rail", async () => {
  const { rows } = await fetchRailStations();
  return `${rows} rail stations`;
});

await check("met datastore", async () => {
  const release = await getLatestMetRelease();
  return `release ${release.releaseDate}`;
});

await check("os open greenspace", async () => {
  const download = await getGreenspaceDownload();
  return `version ${download.version}`;
});

console.log(
  failures.length === 0
    ? "all sources OK"
    : `${failures.length} failed: ${failures.join(", ")}`,
);
if (failures.length > 0) {
  process.exitCode = 1;
}
