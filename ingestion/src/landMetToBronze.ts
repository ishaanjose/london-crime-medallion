import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landMetToBronze(
  csvPath: string,
  releaseDate: string,
  fileKind: "recent" | "historical",
  batchId: string,
): Promise<void> {
  const releaseDir = join(
    DATA_DIR,
    "bronze/met_datastore/lsoa",
    `release=${releaseDate}`,
  );
  const parquetPath = join(releaseDir, `${fileKind}.parquet`);
  await rm(parquetPath, { force: true });
  await mkdir(releaseDir, { recursive: true });

  const connection = await DuckDBConnection.create();
  try {
    await connection.run(`
      COPY (
        SELECT
          *,
          current_timestamp AS ingested_at,
          ${quoteSql(batchId)} AS batch_id
        FROM read_csv(
          ${quoteSql(csvPath)},
          all_varchar = true,
          header = true,
          filename = true
        )
      )
      TO ${quoteSql(parquetPath)}
      (FORMAT parquet, COMPRESSION zstd)
    `);
  } finally {
    connection.closeSync();
  }
}
