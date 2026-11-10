import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { DuckDBConnection } from "@duckdb/node-api";

import { DATA_DIR, DOWNLOADS_DIR } from "./paths.js";
import { quoteSql } from "./sql.js";

export async function landMetRelease(
  files: { kind: "recent" | "historical"; csvPath: string }[],
  releaseDate: string,
  batchId: string,
): Promise<void> {
  const lsoaDir = join(DATA_DIR, "bronze/met_datastore/lsoa");
  const releaseDir = join(lsoaDir, `release=${releaseDate}`);
  const stagingDir = join(DOWNLOADS_DIR, "staging", `met-${releaseDate}`);
  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  const connection = await DuckDBConnection.create();
  try {
    for (const file of files) {
      await connection.run(`
        COPY (
          SELECT
            *,
            current_timestamp AS ingested_at,
            ${quoteSql(batchId)} AS batch_id
          FROM read_csv(
            ${quoteSql(file.csvPath)},
            all_varchar = true,
            header = true,
            delim = ',', quote = '"', escape = '"',
            filename = true
          )
        )
        TO ${quoteSql(join(stagingDir, `${file.kind}.parquet`))}
        (FORMAT parquet, COMPRESSION zstd)
      `);
    }

    await rm(releaseDir, { recursive: true, force: true });
    await mkdir(lsoaDir, { recursive: true });
    await rename(stagingDir, releaseDir);
  } finally {
    connection.closeSync();
    await rm(stagingDir, { recursive: true, force: true });
  }
}
