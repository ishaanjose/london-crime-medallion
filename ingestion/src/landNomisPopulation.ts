import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landPopulation(
  pagePaths: string[],
  release: string,
  batchId: string,
): Promise<void> {
  const dir = join(
    DATA_DIR,
    "bronze/nomis/lsoa21_population",
    `release=${release}`,
  );
  const parquetPath = join(dir, "lsoa21_population.parquet");
  const tempParquetPath = `${parquetPath}.tmp`;
  const quotedPagePaths = pagePaths.map(quoteSql).join(", ");

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const connection = await DuckDBConnection.create();
  try {
    await connection.run(`
      COPY (
        SELECT
          * EXCLUDE (filename),
          filename AS source_file,
          current_timestamp AS ingested_at,
          ${quoteSql(batchId)} AS batch_id
        FROM read_csv(
          [${quotedPagePaths}],
          header = true,
          delim = ',', quote = '"', escape = '"',
          all_varchar = true,
          filename = true
        )
      )
      TO ${quoteSql(tempParquetPath)}
      (FORMAT parquet, COMPRESSION zstd)
    `);
    await rename(tempParquetPath, parquetPath);
  } finally {
    connection.closeSync();
    await rm(tempParquetPath, { force: true });
  }
}
