import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landToBronze(
  extractDir: string,
  archiveName: string,
  dataset: "street" | "outcomes",
  batchId: string,
): Promise<void> {
  const bronzeDir = join(DATA_DIR, "bronze/police_uk", dataset);
  const archiveDir = join(bronzeDir, `archive=${archiveName}`);
  await rm(archiveDir, { recursive: true, force: true });
  await mkdir(archiveDir, { recursive: true });

  const connection = await DuckDBConnection.create();
  try {
    await connection.run(`
      COPY (
        SELECT
          * EXCLUDE ("Month"),
          "Month" AS month,
          current_timestamp AS ingested_at,
          ${quoteSql(batchId)} AS batch_id
        FROM read_csv(
          ${quoteSql(join(extractDir, "*", `*-${dataset}.csv`))},
          all_varchar = true,
          union_by_name = true,
          header = true,
          filename = true
        )
      )
      TO ${quoteSql(archiveDir)}
      (FORMAT parquet, PARTITION_BY (month), COMPRESSION zstd)
    `);
  } finally {
    connection.closeSync();
  }
}
