import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landImd(
  csvPath: string,
  release: string,
  batchId: string,
): Promise<void> {
  const dir = join(DATA_DIR, "bronze/mhclg_imd/file7", `release=${release}`);
  const parquetPath = join(dir, "file7.parquet");
  const tempParquetPath = `${parquetPath}.tmp`;

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

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
          header = true,
          all_varchar = true
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
