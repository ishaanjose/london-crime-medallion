import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withRetry } from "../retry.js";

type PopulationDefinition = {
  structure?: {
    keyfamilies?: {
      keyfamily?: Array<{
        annotations?: {
          annotation?: Array<{
            annotationtitle?: unknown;
            annotationtext?: unknown;
          }>;
        };
      }>;
    };
  };
};

export const NOMIS_POPULATION_BASE =
  "https://www.nomisweb.co.uk/api/v01/dataset/NM_2014_1";

export const NOMIS_PAGE_SIZE = 25000;

export function populationUrl(offset: number): string {
  const params = new URLSearchParams({
    date: "2011-2024",
    geography: "2013265927TYPE151",
    gender: "0",
    c_age: "200",
    measures: "20100",
    select: "DATE,GEOGRAPHY_CODE,GEOGRAPHY_NAME,OBS_VALUE",
    recordoffset: String(offset),
    recordlimit: String(NOMIS_PAGE_SIZE),
  });
  return `${NOMIS_POPULATION_BASE}.data.csv?${params}`;
}

export async function getPopulationInfo(): Promise<{ lastUpdated: string }> {
  const response = await withRetry(async () => {
    const response = await fetch(`${NOMIS_POPULATION_BASE}.def.sdmx.json`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch NOMIS population definition: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  });

  const definition = (await response.json()) as PopulationDefinition;
  const annotations =
    definition.structure?.keyfamilies?.keyfamily?.[0]?.annotations
      ?.annotation;
  const lastUpdated = annotations?.find(
    (annotation) => annotation.annotationtitle === "LastUpdated",
  )?.annotationtext;

  if (typeof lastUpdated !== "string" || lastUpdated.length < 10) {
    throw new Error("NOMIS population definition is missing LastUpdated");
  }

  return { lastUpdated: lastUpdated.slice(0, 10) };
}

export async function fetchPopulationPages(
  destDir: string,
): Promise<string[]> {
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const response = await withRetry(async () => {
      const response = await fetch(populationUrl(offset));
      if (!response.ok) {
        throw new Error(
          `Failed to fetch NOMIS population page: ${response.status} ${response.statusText}`,
        );
      }
      return response;
    });
    const text = await response.text();
    const rows = text.split("\n").filter((line) => line.trim() !== "").length - 1;

    if (rows === 0 && offset === 0) {
      throw new Error("NOMIS population returned an empty first page");
    }

    const path = join(destDir, `page-${offset}.csv`);
    await writeFile(`${path}.tmp`, text);
    await rename(`${path}.tmp`, path);
    paths.push(path);
    console.log(`population: ${rows} rows at offset ${offset}`);

    if (rows < NOMIS_PAGE_SIZE) {
      break;
    }
    offset += NOMIS_PAGE_SIZE;
  }

  return paths;
}
