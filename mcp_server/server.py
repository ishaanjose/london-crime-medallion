"""MCP server for the London crime medallion data.

Run: .venv/bin/python mcp_server/server.py   (stdio transport)

Tools: list_metrics, crime_rate, lookup_postcode, data_quality. Each returns
JSON with value(s), unit, period, exclusions, caveats and data (the export
build). Bad input gets a plain error message, never a traceback.
"""

from __future__ import annotations

import datetime as dt
import functools
import json
import re
import sys
import threading
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mcp.server.mcpserver import MCPServer  # noqa: E402  (mcp 2.x name for FastMCP)
from mcp.types import ToolAnnotations  # noqa: E402

from mcp_server.data import Data, DataError  # noqa: E402

ASB = "Anti-social behaviour"
# Boroughs whose per-resident rate is inflated by visitors (metrics.json,
# crimes_per_1000). City of London and Westminster.
VISITOR_HEAVY = {"E09000001", "E09000033"}
# /area flags an LSOA more than 3 times the London median as visitor-heavy.
INFLATED_RATIO = 3

# Same wording as the site (web/src/lib/postcode.ts).
INVALID_POSTCODE_MESSAGE = "That doesn’t look like a UK postcode. Check it and try again."
POSTCODE_NOT_FOUND_MESSAGE = (
    "We couldn’t find that postcode in London. It may be outside London or no longer in use."
)
POSTCODE_RE = re.compile(r"^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$")

RECORDED_CRIME_CAVEAT = (
    "Police-recorded crime from police.uk: it counts what was reported and recorded, "
    "not all crime that happened."
)

_data: Data | None = None
_data_lock = threading.Lock()


def get_data() -> Data:
    global _data
    with _data_lock:
        if _data is None:
            _data = Data()
        return _data


# ---- result envelope ----------------------------------------------------------


def _month(d: dt.date | None) -> str | None:
    return d.strftime("%Y-%m") if d else None


def _data_block() -> dict[str, Any]:
    try:
        d = get_data()
        b = d.build()
        block = {"built_at": b.built_at, "git_commit": b.git_commit, "source": d.base, "mode": d.mode}
        if d.mode_note:
            block["mode_note"] = d.mode_note
        return block
    except Exception:  # noqa: BLE001 - the data block must never raise
        return {"built_at": None, "git_commit": None}


def envelope(
    *,
    unit: str | None,
    period: tuple[dt.date | None, dt.date | None] | None,
    exclusions: list[dict[str, Any]] | None = None,
    caveats: list[str] | None = None,
    value: Any = None,
    values: Any = None,
    **extra: Any,
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if values is not None:
        out["values"] = values
    else:
        out["value"] = value
    out["unit"] = unit
    out["period"] = (
        {"first_month": _month(period[0]), "last_month": _month(period[1])} if period else None
    )
    out.update(extra)
    out["exclusions"] = exclusions or []
    out["caveats"] = caveats or []
    out["data"] = _data_block()
    return out


def error(message: str, **extra: Any) -> dict[str, Any]:
    return {
        "error": message,
        **extra,
        "value": None,
        "unit": None,
        "period": None,
        "exclusions": [],
        "caveats": [],
        "data": _data_block(),
    }


def safe(fn: Callable[..., dict[str, Any]]) -> Callable[..., dict[str, Any]]:
    """Turn any exception into a plain error result."""

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> dict[str, Any]:
        try:
            return fn(*args, **kwargs)
        except DataError as e:
            return error(f"Could not read the data: {e}")
        except Exception as e:  # noqa: BLE001
            return error(f"Something went wrong ({type(e).__name__}). Try again; if it keeps happening the data source may be unavailable.")

    return wrapper


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("&", " and ")).strip().casefold()


# ---- lookups ------------------------------------------------------------------


def _boroughs(d: Data) -> dict[str, tuple[str, str]]:
    rows = d.query(
        "select distinct borough_code, borough_name from read_parquet($bm) order by borough_name",
        {"bm": d.files("fct_police_uk_borough_month.parquet")},
    )
    return {_norm(r["borough_name"]): (r["borough_code"], r["borough_name"]) for r in rows}


def _crime_groups(d: Data) -> list[str]:
    rows = d.query(
        "select distinct crime_group from read_parquet($cbm) where crime_group is not null order by 1",
        {"cbm": d.files("fct_police_uk_crimes_borough_month.parquet")},
    )
    return [r["crime_group"] for r in rows]


def _coverage_gaps(d: Data, last: dt.date, months: int) -> list[dict[str, Any]]:
    """Coverage gaps overlapping the `months`-month window ending at `last` (dashboard rule)."""
    return d.query(
        """
        select scope as crime_group, start_month, end_month, description
        from read_parquet($ki)
        where issue_type = 'coverage gap'
          and start_month <= $last
          and coalesce(end_month, date '9999-12-01') > ($last - to_months($months))::date
        order by scope
        """,
        {"ki": d.files("rpt_known_issues.parquet"), "last": last, "months": months},
    )


def _population_note(d: Data, last: dt.date, borough_code: str | None) -> str | None:
    years = d.partition_years("fct_police_uk_lsoa_month")
    if last.year not in years:
        return None
    r = d.query(
        """
        select bool_or(population_is_estimated_year) as est, max(population_year) as pop_year
        from read_parquet($lm)
        where month = $last and ($code::varchar is null or borough_code = $code::varchar)
        """,
        {
            "lm": d.files(f"fct_police_uk_lsoa_month/year={last.year}/data_0.parquet"),
            "last": last,
            "code": borough_code,
        },
    )[0]
    if r["est"]:
        return (
            f"Residents are the ONS mid-{r['pop_year']} estimate carried forward to "
            f"{last.year}; no newer estimate is published yet."
        )
    return None


# ---- server -------------------------------------------------------------------

mcp = MCPServer(
    name="london-crime",
    instructions=(
        "London police-recorded crime from the london-crime-medallion project "
        "(police.uk, Metropolitan Police and City of London). Rates are crimes per "
        "1,000 residents and exclude anti-social behaviour and any crime group with a "
        "registered police.uk coverage gap in the window. Always pass on the caveats "
        "and exclusions that come with a number."
    ),
)
READ_ONLY = ToolAnnotations(readOnlyHint=True, idempotentHint=True, openWorldHint=False)


@mcp.tool(annotations=READ_ONLY)
@safe
def list_metrics() -> dict[str, Any]:
    """List the project's metrics (from metrics.json, built from the dbt semantic layer) with plain definitions."""
    d = get_data()
    spec = json.loads(d.text_file("metrics.json"))
    metrics = []
    for m in spec["metrics"]:
        if m.get("expr"):
            formula = m["expr"]
        elif m["type"] == "ratio":
            formula = " / ".join(m.get("input_metrics", []))
        else:
            formula = f"sum of {m.get('measure')}"
        metrics.append(
            {
                "name": m["name"],
                "label": m["label"],
                "definition": (m.get("description") or "").strip() or m["label"],
                "type": m["type"],
                "formula": formula,
                "filter": " ".join(m["filter"].split()) if m.get("filter") else None,
            }
        )
    span = d.query(
        "select min(month) as first, max(month) as last from read_parquet($bm)",
        {"bm": d.files("fct_police_uk_borough_month.parquet")},
    )[0]
    return envelope(
        values=metrics,
        unit=None,
        period=(span["first"], span["last"]),
        caveats=[
            "crime_rate computes crimes_per_1000 for a borough or London; "
            "the charge-rate metrics are listed but not exposed as a tool."
        ],
    )


@mcp.tool(annotations=READ_ONLY)
@safe
def crime_rate(borough: str, crime_group: str | None = None, months: int = 12) -> dict[str, Any]:
    """Crimes per 1,000 residents in a London borough (or "London") over the latest `months` months (1 to 24).

    borough is case-insensitive. crime_group is optional (e.g. "Burglary"). Anti-social
    behaviour is never counted, and crime groups with a registered police.uk coverage gap
    in the window are left out, as on the dashboard.
    """
    if isinstance(months, bool) or not isinstance(months, int) or not 1 <= months <= 24:
        return error("months must be a whole number from 1 to 24.")
    if not isinstance(borough, str) or not borough.strip() or len(borough) > 100:
        return error("borough must be a London borough name, or \"London\".")

    d = get_data()
    boroughs = _boroughs(d)
    key = _norm(borough)
    if key in ("london", "greater london", "all"):
        code, name = None, "London"
    elif key in boroughs:
        code, name = boroughs[key]
    else:
        return error(
            f"\"{borough.strip()}\" is not a London borough in this data.",
            valid_boroughs=["London"] + [v[1] for v in boroughs.values()],
        )

    group = None
    if crime_group is not None and crime_group.strip():
        groups = {_norm(g): g for g in _crime_groups(d)}
        g = groups.get(_norm(crime_group))
        if g is None:
            return error(
                f"\"{crime_group.strip()}\" is not a crime group in this data.",
                valid_crime_groups=[x for x in groups.values() if x != ASB],
            )
        if g == ASB:
            return error(
                "Anti-social behaviour is not a crime, so it is not part of crime rates. "
                "It is recorded separately (metric asb_incidents).",
                valid_crime_groups=[x for x in groups.values() if x != ASB],
            )
        group = g

    bm = d.files("fct_police_uk_borough_month.parquet")
    last = d.query("select max(month) as m from read_parquet($bm)", {"bm": bm})[0]["m"]
    gaps = _coverage_gaps(d, last, months)
    gap_groups = [r["crime_group"] for r in gaps]
    if group in gap_groups:
        gap = next(r for r in gaps if r["crime_group"] == group)
        return error(
            f"{group} is excluded for this window because of a police.uk coverage gap "
            f"from {_month(gap['start_month'])}: {gap['description']}. Its figures would "
            "understate the real level, so no rate is given.",
        )

    row = d.query(
        """
        with
        win as (select ($last - to_months($months - 1))::date as first, $last::date as last),
        c as (
            select crime_group, sum(crime_count) as n
            from read_parquet($cbm), win
            where month between win.first and win.last
              and ($code::varchar is null or borough_code = $code::varchar)
              and crime_group <> 'Anti-social behaviour'
              and ($grp::varchar is null or crime_group = $grp::varchar)
            group by crime_group
        ),
        b as (
            select
                sum(population) filter (where month = win.last) as residents,
                count(distinct month) as months_covered
            from read_parquet($bm), win
            where month between win.first and win.last
              and ($code::varchar is null or borough_code = $code::varchar)
        )
        select
            win.first,
            win.last,
            b.residents,
            b.months_covered,
            coalesce((select sum(n) from c where not list_contains($gaps, crime_group)), 0) as crimes,
            coalesce((select sum(n) from c), 0) as crimes_all_groups,
            (select list({'crime_group': crime_group, 'crimes': n} order by crime_group)
               from c where list_contains($gaps, crime_group)) as left_out
        from win, b
        """,
        {
            "cbm": d.files("fct_police_uk_crimes_borough_month.parquet"),
            "bm": bm,
            "last": last,
            "months": months,
            "code": code,
            "grp": group,
            "gaps": gap_groups,
        },
    )[0]

    residents = row["residents"]
    if not residents:
        return error(f"No resident population for {name} in {_month(last)}.")
    rate = row["crimes"] * 1000.0 / residents
    rate_all = row["crimes_all_groups"] * 1000.0 / residents

    exclusions: list[dict[str, Any]] = [
        {"what": ASB, "why": "Not a crime; recorded separately (metric asb_incidents)."}
    ]
    left_out = {x["crime_group"]: x["crimes"] for x in (row["left_out"] or [])}
    for gap in gaps:
        if group is not None:
            break
        exclusions.append(
            {
                "what": gap["crime_group"],
                "why": f"police.uk coverage gap from {_month(gap['start_month'])}"
                + (f" to {_month(gap['end_month'])}" if gap["end_month"] else " (still open)")
                + f": {gap['description']}",
                "crimes_left_out": int(left_out.get(gap["crime_group"], 0)),
            }
        )

    caveats = [RECORDED_CRIME_CAVEAT]
    if code in VISITOR_HEAVY:
        caveats.append(
            f"Per-resident rates overstate risk where few people live but many visit. {name} "
            "has far more commuters, shoppers and tourists than residents, and crimes against "
            "them count here, so this rate is not a resident's chance of being a victim."
        )
    if months != 12:
        caveats.append(
            f"This is a {months}-month total per 1,000 residents, not an annual rate; "
            f"compare it only with other {months}-month figures."
        )
    if row["months_covered"] < months:
        caveats.append(
            f"Only {row['months_covered']} of the {months} months have data, so the rate is understated."
        )
    pop_note = _population_note(d, last, code)
    if pop_note:
        caveats.append(pop_note)
    if code is None and group is None and months == 12 and gap_groups:
        caveats.append(
            f"The dashboard overview's 'Crimes per 1,000 (12m)' headline includes "
            f"{', '.join(g.lower() for g in gap_groups)} ({rate_all:.1f}); it only applies "
            f"the exclusion to the year-on-year change. This figure ({rate:.1f}) excludes it throughout."
        )

    return envelope(
        value=round(rate, 1),
        unit=f"crimes per 1,000 residents over {months} months",
        period=(row["first"], row["last"]),
        area=name,
        crime_group=group or "All crime groups (excluding those listed in exclusions)",
        crimes=int(row["crimes"]),
        residents=int(residents),
        months_covered=int(row["months_covered"]),
        rate_including_excluded_groups=(
            round(rate_all, 1) if group is None and gap_groups else None
        ),
        exclusions=exclusions,
        caveats=caveats,
    )


def _window_years(last: dt.date, months: int) -> list[int]:
    first_index = last.year * 12 + last.month - 1 - (months - 1)
    return list(range(first_index // 12, last.year + 1))


@mcp.tool(annotations=READ_ONLY)
@safe
def lookup_postcode(postcode: str) -> dict[str, Any]:
    """Look up a London postcode: its LSOA and borough, the 12-month crimes per 1,000 residents there, the London median LSOA rate, IMD decile, and nearest station and park. Same method as the site's /area page."""
    if not isinstance(postcode, str) or len(postcode) > 16:
        return error(INVALID_POSTCODE_MESSAGE)
    key = re.sub(r"\s+", "", postcode).upper()
    if not POSTCODE_RE.match(key):
        return error(INVALID_POSTCODE_MESSAGE)

    d = get_data()
    hit = d.query(
        "select lsoa21_code from read_parquet($pl) where postcode = $pc",
        {"pl": d.files("postcode_lsoa.parquet"), "pc": key},
    )
    pretty = f"{key[:-3]} {key[-3:]}"
    if not hit:
        return error(POSTCODE_NOT_FOUND_MESSAGE, postcode=pretty)
    lsoa = hit[0]["lsoa21_code"]

    clm_table = "fct_police_uk_crimes_lsoa_month"
    latest_year = d.partition_years(clm_table)[-1]
    last = d.query(
        "select max(month) as m from read_parquet($f)",
        {"f": d.files(f"{clm_table}/year={latest_year}/data_0.parquet")},
    )[0]["m"]
    years = _window_years(last, 12)
    gaps = _coverage_gaps(d, last, 12)

    # Mirrors lsoaCtes + buildAreaSummarySql in web/src/lib/place.ts and area.ts.
    rows = d.query(
        """
        with
        clm as (select * from read_parquet($clm)),
        mx as (select $last::date as m),
        crimes as (
            select lsoa21_code, sum(crime_count)::double as n
            from clm, mx
            where month > m - interval 12 month
              and month <= m
              and crime_group is distinct from 'Anti-social behaviour'
              and not list_contains($gaps, coalesce(crime_group, 'Unmapped'))
            group by 1
        ),
        pop as (
            select lsoa21_code, population::double as pop, coalesce(is_low_population, false) as low_pop
            from read_parquet($lm), mx
            where month = m
        ),
        lsoa_all as (
            select
                d.lsoa21_code,
                case when p.pop > 0 then coalesce(c.n, 0) * 1000.0 / p.pop end as rate_per_1000,
                p.low_pop,
                p.pop,
                coalesce(c.n, 0) as crimes
            from read_parquet($dim) as d
            join pop as p using (lsoa21_code)
            left join crimes as c using (lsoa21_code)
        ),
        lsoa as (select * from lsoa_all where not low_pop),
        ref as (
            select quantile_cont(rate_per_1000, 0.5) as london_median, count(*) as london_n
            from lsoa
            where rate_per_1000 is not null
        )
        select
            a.lsoa21_code, d.lsoa21_name, d.borough_name,
            a.rate_per_1000, a.crimes, a.pop, a.low_pop,
            d.imd_decile_2025, d.income_decile_2025,
            d.nearest_station_name, d.nearest_station_m, d.nearest_station_network,
            d.nearest_park_name, d.nearest_park_entrance_m,
            ref.london_median, ref.london_n,
            (select count(*) from lsoa where rate_per_1000 < a.rate_per_1000) as london_below
        from lsoa_all as a
        join read_parquet($dim) as d using (lsoa21_code)
        cross join ref
        where a.lsoa21_code = $lsoa
        """,
        {
            "clm": d.files(*[f"{clm_table}/year={y}/data_0.parquet" for y in years]),
            "lm": d.files(*[f"fct_police_uk_lsoa_month/year={y}/data_0.parquet" for y in years]),
            "dim": d.files("dim_lsoa.parquet"),
            "last": last,
            "gaps": [g["crime_group"] for g in gaps],
            "lsoa": lsoa,
        },
    )
    if not rows:
        return error(f"No population or crime data for LSOA {lsoa}.", postcode=pretty)
    r = rows[0]

    first_index = last.year * 12 + last.month - 1 - 11
    first = dt.date(first_index // 12, first_index % 12 + 1, 1)

    rate = r["rate_per_1000"]
    median = r["london_median"]
    exclusions = [{"what": ASB, "why": "Not a crime; recorded separately (metric asb_incidents)."}]
    for gap in gaps:
        exclusions.append(
            {
                "what": gap["crime_group"],
                "why": f"police.uk coverage gap from {_month(gap['start_month'])}"
                + (f" to {_month(gap['end_month'])}" if gap["end_month"] else " (still open)")
                + f": {gap['description']}",
            }
        )
    exclusions.append(
        {
            "what": "Low-population LSOAs from the London median",
            "why": "Areas flagged low-population swing too much on a few crimes; the site leaves them out of London comparisons.",
        }
    )

    caveats = [RECORDED_CRIME_CAVEAT]
    if r["low_pop"]:
        caveats.append(
            f"Few residents live here ({int(r['pop']):,}), so a handful of crimes moves the rate a lot. "
            "This area is left out of the London comparisons."
        )
    if rate is not None and median and rate > INFLATED_RATIO * median:
        caveats.append(
            "Rates divide by resident population. Busy commercial and transport areas have few "
            "residents but many visitors, so their rates look inflated."
        )
    caveats.append(
        "Distances are straight-line from the middle of the LSOA, not from the postcode, "
        "so they can differ from a map by a few hundred metres."
    )
    pop_note = _population_note(d, last, None)
    if pop_note:
        caveats.append(pop_note)

    share_below = (
        r["london_below"] / r["london_n"] if rate is not None and r["london_n"] else None
    )
    values = {
        "postcode": pretty,
        "lsoa21_code": r["lsoa21_code"],
        "lsoa21_name": r["lsoa21_name"],
        "borough": r["borough_name"],
        "crimes_per_1000": round(rate, 1) if rate is not None else None,
        "crimes": int(r["crimes"]),
        "residents": int(r["pop"]) if r["pop"] is not None else None,
        "london_median_lsoa_crimes_per_1000": round(median, 1) if median is not None else None,
        "london_lsoas_compared": int(r["london_n"]),
        "share_of_london_lsoas_with_lower_rate": round(share_below, 3) if share_below is not None else None,
        "low_population": bool(r["low_pop"]),
        "imd_decile_2025": r["imd_decile_2025"],
        "income_deprivation_decile_2025": r["income_decile_2025"],
        "deciles_note": "1 = most deprived, 10 = least deprived",
        "nearest_station": {
            "name": r["nearest_station_name"],
            "distance_m": r["nearest_station_m"],
            "network": r["nearest_station_network"],
        },
        "nearest_park": {
            "name": r["nearest_park_name"],
            "entrance_distance_m": r["nearest_park_entrance_m"],
        },
    }
    return envelope(
        values=values,
        unit="crimes per 1,000 residents over 12 months",
        period=(first, last),
        exclusions=exclusions,
        caveats=caveats,
    )


@mcp.tool(annotations=READ_ONLY)
@safe
def data_quality(topic: str | None = None) -> dict[str, Any]:
    """Known data issues (breaks, gaps, duplicates, coverage) from rpt_known_issues. Optional topic filters by a case-insensitive text match, e.g. "outcome", "criminal damage", "COVID"."""
    if topic is not None and (not isinstance(topic, str) or len(topic) > 100):
        return error("topic must be a short piece of text, e.g. \"outcome\" or \"criminal damage\".")
    t = topic.strip() if topic and topic.strip() else None

    d = get_data()
    ki = d.files("rpt_known_issues.parquet")
    rows = d.query(
        """
        select issue_type, source, scope, start_month, end_month, severity, description, handling
        from read_parquet($ki)
        where $t::varchar is null
           or contains(lower(concat_ws(' ', issue_type, source, scope, severity, description, handling)),
                       lower($t::varchar))
        order by start_month nulls first, issue_type, scope
        """,
        {"ki": ki, "t": t},
    )
    issues = [
        {
            "issue_type": r["issue_type"],
            "source": r["source"],
            "scope": r["scope"],
            "start_month": _month(r["start_month"]),
            "end_month": _month(r["end_month"]),
            "severity": r["severity"],
            "description": r["description"],
            "handling": r["handling"],
        }
        for r in rows
    ]
    caveats = []
    if t and not issues:
        types = d.query("select distinct issue_type from read_parquet($ki) order by 1", {"ki": ki})
        caveats.append(
            f"No known issue mentions \"{t}\". Issue types: "
            + ", ".join(x["issue_type"] for x in types)
            + ". Call with no topic to list all."
        )
    starts = [r["start_month"] for r in rows if r["start_month"]]
    ends = [r["end_month"] or r["start_month"] for r in rows if r["end_month"] or r["start_month"]]
    return envelope(
        values=issues,
        unit="known issues",
        period=(min(starts), max(ends)) if starts else None,
        count=len(issues),
        caveats=caveats
        + (["An empty end_month means the issue is a one-off change or still in effect; see handling."] if issues else []),
    )


if __name__ == "__main__":
    mcp.run("stdio")
