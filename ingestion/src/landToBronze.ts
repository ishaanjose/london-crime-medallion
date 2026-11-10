import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR, DOWNLOADS_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landToBronze(
  extractDir: string,
  archiveName: string,
  dataset: "street" | "outcomes",
  batchId: string,
): Promise<void> {
  const bronzeDir = join(DATA_DIR, "bronze/police_uk", dataset);
  const archiveDir = join(bronzeDir, `archive=${archiveName}`);
  const stagingDir = join(
    DOWNLOADS_DIR,
    "staging",
    `police_uk-${dataset}-${archiveName}`,
  );
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

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
      TO ${quoteSql(stagingDir)}
      (FORMAT parquet, PARTITION_BY (month), COMPRESSION zstd)
    `);

    await rm(archiveDir, { recursive: true, force: true });
    await mkdir(bronzeDir, { recursive: true });
    await rename(stagingDir, archiveDir);
  } finally {
    connection.closeSync();
    await rm(stagingDir, { recursive: true, force: true });
  }
}
