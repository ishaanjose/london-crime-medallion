{{ config(materialized='table') }}

with stations as (
    select *
    from {{ ref('stg_tfl__stop_points') }}
    where stop_type in ('NaptanMetroStation', 'NaptanRailStation')
),
grouped as (
    select
        coalesce(hub_naptan_code, naptan_id) as station_key,
        -- shortest name; alphabetical among names of the same length, so the pick is stable
        arg_min(name, (length(name), name)) as name,
        avg(latitude) as latitude,
        avg(longitude) as longitude,
        list(distinct mode order by mode) as modes,
        list(distinct naptan_id order by naptan_id) as naptan_ids
    from stations
    group by coalesce(hub_naptan_code, naptan_id)
),
line_ids as (
    select
        coalesce(hub_naptan_code, naptan_id) as station_key,
        unnest(lines) as line
    from stations
),
with_lines as (
    select
        grouped.*,
        list(distinct line.id order by line.id) as lines
    from grouped
    left join line_ids
        on grouped.station_key = line_ids.station_key
    group by all
)
select
    stations.station_key,
    stations.name,
    stations.latitude,
    stations.longitude,
    stations.modes,
    stations.lines,
    stations.naptan_ids,
    lsoa.lsoa21_code,
    lsoa.borough_code,
    lsoa.lsoa21_code is not null as is_in_london
from with_lines as stations
left join {{ ref('ons__london_lsoa21') }} as lsoa
    on ST_Contains(
        lsoa.geometry,
        ST_Point(stations.longitude, stations.latitude)
    )
