// Stages the DuckDB-WASM runtime under public/duckdb/ so the site loads it from
// its own origin instead of cdn.jsdelivr.net and extensions.duckdb.org.
//
// - The .wasm modules are over Cloudflare Pages' 25 MiB per-file limit, so they
//   are shipped as gzip -9 -n (stable bytes) and decompressed in the browser.
// - The parquet extension is the official signed build, checked against a pinned
//   sha256 so a changed upstream file fails the build instead of shipping.
//
// Output is gitignored and rebuilt from node_modules; nothing here is committed.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_VERSION = "1.33.1-dev57.0";
// DuckDB core version inside that package; it is the path the wasm build asks
// the extension repository for.
const DUCKDB_VERSION = "v1.5.4";
const EXTENSIONS = [
  {
    platform: "wasm_eh",
    name: "parquet",
    sha256: "4845705bbd69fc9ad52878d96a505c73cae4a6c509822079cc2413e5eb437f95",
  },
  {
    platform: "wasm_mvp",
    name: "parquet",
    sha256: "b64c255a7f7d06cc234535b2f0ecab345fda91bffff5509d3179004bc13aa19a",
  },
];
const BUNDLES = ["eh", "mvp"];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = path.join(webDir, "node_modules/@duckdb/duckdb-wasm");
const distDir = path.join(pkgDir, "dist");
const outRoot = path.join(webDir, "public/duckdb");
const outDir = path.join(outRoot, PACKAGE_VERSION);

function fail(msg) {
  console.error(`prepare-duckdb: ${msg}`);
  process.exit(1);
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function isFresh(out, src) {
  return fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;
}

const installed = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")).version;
if (installed !== PACKAGE_VERSION) {
  fail(
    `installed @duckdb/duckdb-wasm is ${installed}, script is pinned to ${PACKAGE_VERSION}. ` +
      "Update PACKAGE_VERSION, DUCKDB_VERSION and the extension hashes together.",
  );
}

// Older versions left behind would be shipped too; keep only the pinned one.
fs.mkdirSync(outRoot, { recursive: true });
for (const entry of fs.readdirSync(outRoot)) {
  if (entry !== PACKAGE_VERSION) fs.rmSync(path.join(outRoot, entry), { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

for (const b of BUNDLES) {
  const worker = `duckdb-browser-${b}.worker.js`;
  fs.copyFileSync(path.join(distDir, worker), path.join(outDir, worker));

  const wasm = path.join(distDir, `duckdb-${b}.wasm`);
  const gz = path.join(outDir, `duckdb-${b}.wasm.gz`);
  if (!isFresh(gz, wasm)) {
    fs.writeFileSync(gz, execFileSync("gzip", ["-9", "-n", "-c", wasm], { maxBuffer: 1 << 30 }));
  }
}

for (const ext of EXTENSIONS) {
  const rel = `${DUCKDB_VERSION}/${ext.platform}/${ext.name}.duckdb_extension.wasm`;
  const dest = path.join(outDir, "extensions", rel);
  if (fs.existsSync(dest) && sha256(dest) === ext.sha256) continue;

  const url = `https://extensions.duckdb.org/${rel}`;
  const res = await fetch(url);
  if (!res.ok) fail(`${url}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== ext.sha256) fail(`${url}: sha256 ${got}, expected ${ext.sha256}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}
for (const f of walk(outDir)) {
  const size = fs.statSync(f).size;
  if (size > MAX_FILE_BYTES) fail(`${path.relative(webDir, f)} is ${size} bytes, over 25 MiB`);
}
console.log(`prepare-duckdb: staged ${path.relative(webDir, outDir)}`);
