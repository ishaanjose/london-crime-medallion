"""Export gold tables to Parquet for the web dashboard, with a hashed index.json."""

import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import duckdb

REPO = Path(__file__).resolve().parents[1]
WAREHOUSE = REPO / "data/warehouse.duckdb"
TARGET = REPO / "transform/target"
OUT = REPO / "data/export"
STAGING = REPO / "data/export.tmp"
OLD = REPO / "data/export.old"

# the dashboard loads these over the network; a gold change that bloats a file should fail the build, not the page
MAX_TOTAL_BYTES = 150 * 1024 * 1024
MAX_FILE_BYTES = 8 * 1024 * 1024

EXPORTS = [
    {"name": "dim_lsoa", "table": "main_gold.dim_lsoa", "partition": None},
    {"name": "dim_postcode", "table": "main_gold.dim_postcode", "partition": None},
    {"name": "dim_map_point", "table": "main_gold.dim_map_point", "partition": None},
    {"name": "fct_police_uk_lsoa_month", "table": "main_gold.fct_police_uk_lsoa_month", "partition": "year"},
    {"name": "fct_police_uk_point_month", "table": "main_gold.fct_police_uk_point_month", "partition": "month"},
    {"name": "fct_police_uk_borough_month", "table": "main_gold.fct_police_uk_borough_month", "partition": None},
    {"name": "fct_police_uk_crimes_borough_month", "table": "main_gold.fct_police_uk_crimes_borough_month", "partition": None},
    {"name": "fct_police_uk_london_month", "table": "main_gold.fct_police_uk_london_month", "partition": None},
    {"name": "fct_police_uk_charge_rates", "table": "main_gold.fct_police_uk_charge_rates", "partition": None},
    {"name": "fct_police_uk_outcome_mix", "table": "main_gold.fct_police_uk_outcome_mix", "partition": None},
    {"name": "rpt_crime_concentration", "table": "main_gold.rpt_crime_concentration", "partition": None},
    {"name": "rpt_crime_concentration_summary", "table": "main_gold.rpt_crime_concentration_summary", "partition": None},
    {"name": "rpt_source_freshness", "table": "main_gold.rpt_source_freshness", "partition": None},
    {"name": "rpt_known_issues", "table": "main_gold.rpt_known_issues", "partition": None},
    {"name": "rpt_crime_reconciliation", "table": "main_gold.rpt_crime_reconciliation", "partition": None},
]

PARTITION_COLUMNS = {
    "year": ("year(month) as year", "year"),
    "month": ("strftime(month, '%Y-%m') as month_key", "month_key"),
}

PARQUET = "FORMAT parquet, COMPRESSION zstd"

GEOJSON_EXPORTS = [
    {"name": "geo_lsoa", "table": "main_gold.geo_lsoa", "id": "lsoa21_code", "extras": []},
    {"name": "geo_borough", "table": "main_gold.geo_borough", "id": "borough_code", "extras": ["borough_name"]},
]


def export_tables(con: duckdb.DuckDBPyConnection) -> None:
    for spec in EXPORTS:
        name, table, partition = spec["name"], spec["table"], spec["partition"]
        if partition is None:
            dest = STAGING / f"{name}.parquet"
            con.execute(f"COPY (select * from {table}) TO '{dest}' ({PARQUET})")
        else:
            expr, column = PARTITION_COLUMNS[partition]
            dest = STAGING / name
            con.execute(
                f"COPY (select *, {expr} from {table}) TO '{dest}' "
                f"({PARQUET}, PARTITION_BY ({column}))"
            )
        print(f"exported {name}")


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def write_json(name: str, data: dict) -> None:
    (STAGING / name).write_text(json.dumps(data, separators=(",", ":")))


def where_text(filter_: dict | None) -> str | None:
    if not filter_:
        return None
    return "\n".join(f["where_sql_template"].strip() for f in filter_["where_filters"])


def write_metrics() -> None:
    semantic = load_json(TARGET / "semantic_manifest.json")
    metrics = []
    for m in semantic["metrics"]:
        params = m["type_params"]
        if m["type"] == "simple":
            inputs = {"measure": params["measure"]["name"]}
        elif m["type"] == "ratio":
            inputs = {"input_metrics": [params["numerator"]["name"], params["denominator"]["name"]]}
        else:
            inputs = {"input_metrics": [i["name"] for i in params["metrics"]], "expr": params["expr"]}
        metrics.append({
            "name": m["name"],
            "label": m["label"],
            "description": m["description"],
            "type": m["type"],
            **inputs,
            "filter": where_text(m["filter"]),
        })
    semantic_models = [
        {
            "name": sm["name"],
            "description": sm["description"],
            "dimensions": [{"name": d["name"], "type": d["type"]} for d in sm["dimensions"]],
        }
        for sm in semantic["semantic_models"]
    ]
    write_json("metrics.json", {"metrics": metrics, "semantic_models": semantic_models})


def tested_node(test: dict) -> str:
    # relationships tests depend on both models; attached_node is the one being tested
    return test.get("attached_node") or test["depends_on"]["nodes"][0]


def write_tests(manifest: dict, allow_partial: bool) -> None:
    run_results = load_json(TARGET / "run_results.json")
    args = run_results["args"]
    # run_results.json only describes the last dbt command, so a partial build would
    # publish "9 of 9 pass" for 9 tests out of hundreds
    partial = bool(args.get("select")) or bool(args.get("exclude")) or args.get("which") not in ("build", "test")
    if partial and not allow_partial:
        raise SystemExit(
            "run_results.json is from a partial build; run a full dbt build before exporting"
        )
    nodes = manifest["nodes"]
    tests = []
    for r in run_results["results"]:
        if not r["unique_id"].startswith("test."):
            continue
        node = nodes[r["unique_id"]]
        tests.append({
            "name": node["name"],
            "model": tested_node(node).split(".")[-1],
            "status": r["status"],
            "failures": r["failures"],
            "execution_time": round(r["execution_time"], 3),
        })
    counts: dict[str, int] = {}
    for t in tests:
        counts[t["status"]] = counts.get(t["status"], 0) + 1
    output = {
        "generated_at": run_results["metadata"]["generated_at"],
        "dbt_version": run_results["metadata"]["dbt_version"],
        "counts": counts,
        "tests": tests,
    }
    if partial:
        output["partial"] = True
    write_json("tests.json", output)


def write_lineage(manifest: dict) -> None:
    test_counts: dict[str, int] = {}
    for node in manifest["nodes"].values():
        if node["resource_type"] == "test":
            target = tested_node(node)
            test_counts[target] = test_counts.get(target, 0) + 1

    graph_nodes = [n for n in manifest["nodes"].values() if n["resource_type"] in ("model", "seed")]
    graph_nodes += list(manifest["sources"].values())
    layers = {"source": "bronze", "seed": "seed"}
    nodes = [
        {
            "id": n["unique_id"],
            "name": n["name"],
            "resource_type": n["resource_type"],
            "layer": layers.get(n["resource_type"]) or n["fqn"][1],
            "materialized": n.get("config", {}).get("materialized"),
            "test_count": test_counts.get(n["unique_id"], 0),
        }
        for n in graph_nodes
    ]
    ids = {n["id"] for n in nodes}
    edges = [
        [parent, n["unique_id"]]
        for n in graph_nodes
        for parent in n.get("depends_on", {}).get("nodes", [])
        if parent in ids
    ]
    write_json("lineage.json", {"nodes": nodes, "edges": edges})


METADATA_ROWS = {
    "metrics.json": lambda d: len(d["metrics"]),
    "tests.json": lambda d: len(d["tests"]),
    "lineage.json": lambda d: len(d["nodes"]),
}


def write_geojson(
    con: duckdb.DuckDBPyConnection, table: str, id_column: str, extra_columns: list[str], path: Path
) -> None:
    columns = [id_column, *extra_columns]
    rows = con.execute(
        f"select {', '.join(columns)}, ST_AsGeoJSON(geometry) from {table} order by {id_column}"
    ).fetchall()
    features = [
        {
            "type": "Feature",
            "id": row[0],
            "properties": dict(zip(columns, row[:-1])),
            "geometry": json.loads(row[-1]),
        }
        for row in rows
    ]
    collection = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(collection, separators=(",", ":")))


def export_geojson(con: duckdb.DuckDBPyConnection) -> None:
    for spec in GEOJSON_EXPORTS:
        write_geojson(con, spec["table"], spec["id"], spec["extras"], STAGING / f"{spec['name']}.geojson")
        print(f"exported {spec['name']}")


def file_entry(path: Path, rows: int) -> dict:
    return {
        "path": path.relative_to(STAGING).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256_prefix(path),
        "rows": rows,
    }


def sha256_prefix(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:16]


def parquet_columns(con: duckdb.DuckDBPyConnection, path: Path) -> list[dict]:
    # hive_partitioning off so a partition file reports the columns it actually holds;
    # the partition key is recorded separately as partition_by
    described = con.execute(
        "describe select * from read_parquet(?, hive_partitioning = false)", [str(path)]
    ).fetchall()
    return [{"name": row[0], "type": row[1]} for row in described]


def build_index(con: duckdb.DuckDBPyConnection) -> dict:
    files = []
    for path in sorted(STAGING.glob("*.parquet")):
        rows = con.execute("select count(*) from read_parquet(?)", [str(path)]).fetchone()[0]
        files.append({**file_entry(path, rows), "columns": parquet_columns(con, path)})

    # partitioned tables share one schema, so record it once per table, not per file
    partitioned = {}
    for spec in EXPORTS:
        if spec["partition"] is None:
            continue
        parts = sorted((STAGING / spec["name"]).rglob("*.parquet"))
        for path in parts:
            rows = con.execute("select count(*) from read_parquet(?)", [str(path)]).fetchone()[0]
            files.append(file_entry(path, rows))
        partitioned[spec["name"]] = {
            "partition_by": PARTITION_COLUMNS[spec["partition"]][1],
            "columns": parquet_columns(con, parts[0]),
        }

    for path in sorted(STAGING.glob("*.geojson")):
        features = json.loads(path.read_text())["features"]
        files.append(file_entry(path, len(features)))
    for name, count_rows in METADATA_ROWS.items():
        path = STAGING / name
        files.append(file_entry(path, count_rows(load_json(path))))
    git_commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.strip()
    # without this, an export built from uncommitted code claims a commit it doesn't match
    dirty = bool(subprocess.run(
        ["git", "status", "--porcelain"], cwd=REPO, capture_output=True, text=True, check=True
    ).stdout.strip())
    return {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit,
        "git_dirty": dirty,
        "partitioned_tables": partitioned,
        "files": files,
    }


def check_size_budget(index: dict) -> None:
    files = index["files"]
    total = sum(f["bytes"] for f in files)
    problems = [
        f"{f['path']} is {f['bytes'] / 1e6:.1f} MB (limit {MAX_FILE_BYTES / 1e6:.1f} MB)"
        for f in files
        if f["bytes"] > MAX_FILE_BYTES
    ]
    if total > MAX_TOTAL_BYTES:
        problems.append(f"export is {total / 1e6:.1f} MB in total (limit {MAX_TOTAL_BYTES / 1e6:.1f} MB)")
    if problems:
        raise SystemExit("export over size budget; data/export left unchanged:\n  " + "\n  ".join(problems))


def swap_into_place() -> None:
    if OLD.exists():
        shutil.rmtree(OLD)
    if OUT.exists():
        OUT.rename(OLD)
    STAGING.rename(OUT)
    if OLD.exists():
        shutil.rmtree(OLD)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-partial-tests",
        action="store_true",
        help="export tests.json even if the last dbt command was a partial build (local experiments only)",
    )
    args = parser.parse_args()

    if STAGING.exists():
        shutil.rmtree(STAGING)
    STAGING.mkdir(parents=True)

    # metadata first, so a partial build fails before the slow table export
    manifest = load_json(TARGET / "manifest.json")
    write_tests(manifest, args.allow_partial_tests)
    write_lineage(manifest)
    write_metrics()

    con = duckdb.connect(str(WAREHOUSE), read_only=True)
    try:
        con.load_extension("spatial")
        export_tables(con)
        export_geojson(con)
        index = build_index(con)
    finally:
        con.close()

    check_size_budget(index)
    (STAGING / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    swap_into_place()
    print(f"wrote {len(index['files'])} files to {OUT}")


if __name__ == "__main__":
    main()
