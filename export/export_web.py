"""Export gold tables to Parquet for the web dashboard, with a hashed index.json."""

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

EXPORTS = [
    {"name": "dim_lsoa", "table": "main_gold.dim_lsoa", "partition": None},
    {"name": "dim_postcode", "table": "main_gold.dim_postcode", "partition": None},
    {"name": "dim_map_point", "table": "main_gold.dim_map_point", "partition": None},
    {"name": "fct_police_uk_lsoa_month", "table": "main_gold.fct_police_uk_lsoa_month", "partition": "year"},
    {"name": "fct_police_uk_point_month", "table": "main_gold.fct_police_uk_point_month", "partition": "month"},
    {"name": "fct_police_uk_borough_month", "table": "main_gold.fct_police_uk_borough_month", "partition": None},
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


def sha256_prefix(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:16]


def build_index(con: duckdb.DuckDBPyConnection) -> dict:
    files = []
    for path in sorted(STAGING.rglob("*.parquet")):
        rows = con.execute("select count(*) from read_parquet(?)", [str(path)]).fetchone()[0]
        files.append({
            "path": path.relative_to(STAGING).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256_prefix(path),
            "rows": rows,
        })
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
        "files": files,
    }


def swap_into_place() -> None:
    if OLD.exists():
        shutil.rmtree(OLD)
    if OUT.exists():
        OUT.rename(OLD)
    STAGING.rename(OUT)
    if OLD.exists():
        shutil.rmtree(OLD)


def main() -> None:
    if STAGING.exists():
        shutil.rmtree(STAGING)
    STAGING.mkdir(parents=True)

    con = duckdb.connect(str(WAREHOUSE), read_only=True)
    try:
        export_tables(con)
        index = build_index(con)
    finally:
        con.close()

    (STAGING / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    swap_into_place()
    print(f"wrote {len(index['files'])} files to {OUT}")


if __name__ == "__main__":
    main()
