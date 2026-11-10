import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR, DOWNLOADS_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landRailStations(
  text: string,
  snapshotDate: string,
  batchId: string,
): Promise<void> {
  const dir = join(
    DATA_DIR,
    "bronze/naptan/rail_stations",
    `snapshot=${snapshotDate}`,
  );
  const parquetPath = join(dir, "rail_stations.parquet");
  const tempParquetPath = `${parquetPath}.tmp`;
  const csvPath = join(DOWNLOADS_DIR, `naptan_rail_${batchId}.csv`);

  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await mkdir(DOWNLOADS_DIR, { recursive: true });

  const connection = await DuckDBConnection.create();
  try {
    await writeFile(csvPath, text, "utf8");
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
    await rm(csvPath, { force: true });
  }
}
