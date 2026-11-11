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

async function createDb(): Promise<AsyncDuckDB> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

  // The worker script lives on jsDelivr; a same-origin blob wrapper lets us load it.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(workerUrl);

  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return db;
}
