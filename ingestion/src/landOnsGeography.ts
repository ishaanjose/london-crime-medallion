import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR, DOWNLOADS_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landBoundaries(
  features: unknown[],
  editDate: string,
): Promise<void> {
  const dir = join(
    DATA_DIR,
    "bronze/ons_geography/lsoa21_boundaries",
    `edit=${editDate}`,
  );
  const finalPath = join(dir, "lsoa21_boundaries.geojson");
  const tempPath = `${finalPath}.tmp`;

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  await writeFile(
    tempPath,
    JSON.stringify({
      type: "FeatureCollection",
      features,
    }),
  );

  await rename(tempPath, finalPath);
}

export async function landAttributeTable(
  dataset: string,
  features: unknown[],
  editDate: string,
  batchId: string,
): Promise<void> {
  const dir = join(
    DATA_DIR,
    "bronze/ons_geography",
    dataset,
    `edit=${editDate}`,
  );
  const jsonPath = join(DOWNLOADS_DIR, `${dataset}-${randomUUID()}.json`);
  const parquetPath = join(dir, `${dataset}.parquet`);
  const tempParquetPath = `${parquetPath}.tmp`;

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const records = features.map((feature) => {
    if (
      typeof feature !== "object" ||
      feature === null ||
      !("attributes" in feature)
    ) {
      throw new Error(`ONS ${dataset} feature is missing attributes`);
    }
    const attributes = (feature as { attributes?: unknown }).attributes;
    if (typeof attributes !== "object" || attributes === null) {
      throw new Error(`ONS ${dataset} feature has invalid attributes`);
    }
    return attributes;
  });

  await mkdir(DOWNLOADS_DIR, { recursive: true });
  try {
    await writeFile(jsonPath, JSON.stringify(records));

    const connection = await DuckDBConnection.create();
    try {
      await connection.run(`
        COPY (
          SELECT *,
            current_timestamp AS ingested_at,
            ${quoteSql(batchId)} AS batch_id
          FROM read_json(${quoteSql(jsonPath)})
        )
        TO ${quoteSql(tempParquetPath)}
        (FORMAT parquet, COMPRESSION zstd)
      `);
    } finally {
      connection.closeSync();
    }

    await rename(tempParquetPath, parquetPath);
  } finally {
    await rm(jsonPath, { force: true });
    await rm(tempParquetPath, { force: true });
  }
}
