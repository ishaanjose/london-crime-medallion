import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

const GREENSPACE_LAYERS = ["greenspace_site", "access_point"] as const;

export async function landGreenspace(
  gpkgPath: string,
  version: string,
  batchId: string,
): Promise<void> {
  const paths = GREENSPACE_LAYERS.map((layer) => {
    const dir = join(
      DATA_DIR,
      "bronze/os_open_greenspace",
      layer,
      `version=${version}`,
    );
    const parquetPath = join(dir, `${layer}.parquet`);
    return { dir, parquetPath, tempPath: `${parquetPath}.tmp`, layer };
  });

  for (const { dir } of paths) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }

  const connection = await DuckDBConnection.create();
  try {
    await connection.run("INSTALL spatial; LOAD spatial;");
    for (const { layer, parquetPath, tempPath } of paths) {
      await connection.run(`
        COPY (
          SELECT
            *,
            current_timestamp AS ingested_at,
            ${quoteSql(batchId)} AS batch_id
          FROM st_read(
            ${quoteSql(gpkgPath)},
            layer = ${quoteSql(layer)}
          )
        )
        TO ${quoteSql(tempPath)}
        (FORMAT parquet, COMPRESSION zstd)
      `);
      await rename(tempPath, parquetPath);
    }
  } finally {
    connection.closeSync();
    for (const { tempPath } of paths) {
      await rm(tempPath, { force: true });
    }
  }
}
