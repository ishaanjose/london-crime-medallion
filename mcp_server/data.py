

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb

DEFAULT_BASE = "https://london-crime-medallion.pages.dev/data"
INDEX_TTL_SECONDS = 300  # matches the site's Cache-Control max-age
HTTP_TIMEOUT_SECONDS = 30
USER_AGENT = "london-crime-mcp/1.0"


class DataError(Exception):
    """A problem reading the data, with a message safe to show a caller."""


@dataclass(frozen=True)
class BuildInfo:
    built_at: str
    git_commit: str


def _cache_root() -> Path:
    xdg = os.environ.get("XDG_CACHE_HOME")
    root = Path(xdg) if xdg else Path.home() / ".cache"
    return root / "london-crime-medallion"


def _is_url(base: str) -> bool:
    return base.startswith(("http://", "https://"))


def _http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
        return resp.read()


class Data:
    def __init__(self, base: str | None = None, mode: str | None = None):
        base = (base or os.environ.get("LONDON_CRIME_DATA") or DEFAULT_BASE).strip()
        self.base = base.rstrip("/")
        self.is_url = _is_url(self.base)
        if not self.is_url:
            folder = Path(self.base).expanduser().resolve()
            if not (folder / "index.json").is_file():
                raise DataError(f"LONDON_CRIME_DATA folder has no index.json: {folder}")
            self.base = str(folder)

        requested = (mode or os.environ.get("LONDON_CRIME_DATA_MODE") or "auto").lower()
        if requested not in ("auto", "url", "cache"):
            raise DataError("LONDON_CRIME_DATA_MODE must be auto, url or cache")
        self._requested_mode = requested
        self.mode = "local" if not self.is_url else None  # set by _choose_mode
        self.mode_note = ""

        self._lock = threading.RLock()
        self._con = duckdb.connect(":memory:")
        self._index: dict[str, Any] | None = None
        self._index_checked = 0.0
        self._httpfs_loaded = False

    # ---- index -----------------------------------------------------------

    def index(self) -> dict[str, Any]:
        """index.json, rechecked at most every INDEX_TTL_SECONDS."""
        with self._lock:
            if self._index is not None and time.monotonic() - self._index_checked < INDEX_TTL_SECONDS:
                return self._index
            if not self.is_url:
                idx = json.loads((Path(self.base) / "index.json").read_text())
            else:
                try:
                    idx = json.loads(_http_get(f"{self.base}/index.json"))
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                    if self._index is not None:
                        # Keep serving the build already loaded.
                        self._index_checked = time.monotonic()
                        return self._index
                    cached = self._latest_cached_index()
                    if cached is None:
                        raise DataError(f"Could not fetch {self.base}/index.json: {e}") from e
                    idx = cached
                    self.mode_note = "index.json unreachable; serving the last cached build"
            self._index = idx
            self._index_checked = time.monotonic()
            if self.mode is None:
                self._choose_mode()
            return idx

    def build(self) -> BuildInfo:
        idx = self.index()
        return BuildInfo(built_at=idx["built_at"], git_commit=idx["git_commit"])

    def _file_entry(self, path: str) -> dict[str, Any]:
        for f in self.index()["files"]:
            if f["path"] == path:
                return f
        raise DataError(f"{path} is not in the export index")

    def partition_years(self, table: str) -> list[int]:
        pattern = re.compile(rf"^{re.escape(table)}/year=(\d{{4}})/data_0\.parquet$")
        years = sorted(
            int(m.group(1)) for f in self.index()["files"] if (m := pattern.match(f["path"]))
        )
        if not years:
            raise DataError(f"{table}: no year partitions in the export index")
        return years

    # ---- mode selection --------------------------------------------------

    def _load_httpfs(self) -> None:
        if not self._httpfs_loaded:
            try:
                self._con.execute("load httpfs")
            except duckdb.Error:
                self._con.execute("install httpfs")
                self._con.execute("load httpfs")
            self._httpfs_loaded = True

    def _choose_mode(self) -> None:
        if self._requested_mode == "url":
            try:
                self._load_httpfs()
                self.mode = "url"
                return
            except duckdb.Error as e:
                self.mode_note = f"url mode unavailable ({type(e).__name__}); using local cache"
        self.mode = "cache"

    # ---- file resolution -------------------------------------------------

    def files(self, *paths: str) -> list[str]:
        """Locations DuckDB can read for these export paths, downloading in cache mode."""
        idx = self.index()
        entries = [self._file_entry(p) for p in paths]
        if self.mode == "local":
            return [str(Path(self.base) / e["path"]) for e in entries]
        if self.mode == "url":
            return [f"{self.base}/{e['path']}" for e in entries]
        return [str(self._cached(e, idx)) for e in entries]

    def text_file(self, path: str) -> str:
        """A small JSON/text file from the export (e.g. metrics.json)."""
        self._file_entry(path)
        if self.mode == "local":
            return (Path(self.base) / path).read_text()
        if self.mode == "cache":
            dest = self._build_dir(self.index()) / path
            if not dest.is_file():
                dest.parent.mkdir(parents=True, exist_ok=True)
                self._atomic_write(dest, _http_get(f"{self.base}/{path}"))
            return dest.read_text()
        return _http_get(f"{self.base}/{path}").decode()

    # ---- cache -----------------------------------------------------------

    def _build_dir(self, idx: dict[str, Any]) -> Path:
        safe = re.sub(r"[^0-9A-Za-z]", "", idx["built_at"])
        return _cache_root() / safe

    def _latest_cached_index(self) -> dict[str, Any] | None:
        root = _cache_root()
        if not root.is_dir():
            return None
        found = sorted(root.glob("*/index.json"))
        if not found:
            return None
        self.mode = "cache"
        return json.loads(found[-1].read_text())

    @staticmethod
    def _atomic_write(dest: Path, data: bytes) -> None:
        fd, tmp = tempfile.mkstemp(dir=dest.parent, prefix=".part-")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(data)
            os.replace(tmp, dest)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def _cached(self, entry: dict[str, Any], idx: dict[str, Any]) -> Path:
        build_dir = self._build_dir(idx)
        dest = build_dir / entry["path"]
        if dest.is_file() and dest.stat().st_size == entry["bytes"]:
            return dest
        if not (build_dir / "index.json").is_file():
            build_dir.mkdir(parents=True, exist_ok=True)
            self._atomic_write(build_dir / "index.json", json.dumps(idx).encode())
            # A new build: drop older ones.
            for other in _cache_root().iterdir():
                if other.is_dir() and other != build_dir:
                    shutil.rmtree(other, ignore_errors=True)
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            body = _http_get(f"{self.base}/{entry['path']}")
        except (urllib.error.URLError, TimeoutError) as e:
            raise DataError(f"Could not download {entry['path']}: {e}") from e
        digest = hashlib.sha256(body).hexdigest()
        if not digest.startswith(entry["sha256"]):
            raise DataError(f"{entry['path']}: checksum does not match index.json")
        self._atomic_write(dest, body)
        return dest

    # ---- queries ---------------------------------------------------------

    def query(self, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Run a fixed SQL string with bound parameters; rows as dicts."""
        with self._lock:
            cur = self._con.cursor()
            try:
                cur.execute(sql, params or {})
                cols = [d[0] for d in cur.description]
                return [dict(zip(cols, row)) for row in cur.fetchall()]
            finally:
                cur.close()
