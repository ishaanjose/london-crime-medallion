import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

let dbPromise: Promise<AsyncDuckDB> | null = null;

// duckdb-wasm needs a browser, so it is imported lazily: a top-level import
// breaks `next build`, which pre-renders pages without one.
export function getDb(): Promise<AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = createDb().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// The .wasm is over Cloudflare Pages' 25 MiB file limit, so
// scripts/prepare-duckdb.mjs ships it gzipped and it is inflated here.
async function gunzipToWasmUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`${url}: ${res.status} ${res.statusText}`);
  }
  const inflated = res.body.pipeThrough(new DecompressionStream("gzip"));
  const bytes = await new Response(inflated).arrayBuffer();
  return URL.createObjectURL(new Blob([bytes], { type: "application/wasm" }));
}

async function createDb(): Promise<AsyncDuckDB> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  // Staged by scripts/prepare-duckdb.mjs from the installed package.
  const base = new URL(`/duckdb/${duckdb.PACKAGE_VERSION}/`, window.location.href).toString();
  const bundle = await duckdb.selectBundle({
    mvp: {
      mainModule: `${base}duckdb-mvp.wasm.gz`,
      mainWorker: `${base}duckdb-browser-mvp.worker.js`,
    },
    eh: {
      mainModule: `${base}duckdb-eh.wasm.gz`,
      mainWorker: `${base}duckdb-browser-eh.worker.js`,
    },
  });

  // Started first so the worker script loads while the wasm downloads.
  const worker = new Worker(bundle.mainWorker!);
  let wasmUrl: string | null = null;
  try {
    wasmUrl = await gunzipToWasmUrl(bundle.mainModule);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate(wasmUrl, bundle.pthreadWorker);

    // read_parquet autoloads the parquet extension; serve the official signed
    // build from this origin rather than extensions.duckdb.org.
    const conn = await db.connect();
    try {
      await conn.query(`SET custom_extension_repository = '${base}extensions'`);
    } finally {
      await conn.close();
    }
    return db;
  } catch (err) {
    worker.terminate();
    throw err;
  } finally {
    if (wasmUrl) URL.revokeObjectURL(wasmUrl);
  }
}
