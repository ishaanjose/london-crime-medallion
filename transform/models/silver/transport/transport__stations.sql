{{ config(materialized='table') }}

with tfl as (
    select
        station_key,
        name,
        'tfl' as network,
        modes,
        latitude,
        longitude
    from {{ ref('tfl__stations') }}
),
tfl_bng as (
    select
        ST_Transform(
            ST_Point(longitude, latitude), 'EPSG:4326', 'EPSG:27700', always_xy := true
        ) as geom_bng
    from tfl
),
nr as (
    select * from {{ ref('stg_naptan__rail_stations') }}
),
national_rail as (
    select
        nr.atco_code as station_key,
        nr.name,
        'national_rail' as network,
        ['national-rail'] as modes,
        nr.latitude,
        nr.longitude
    from nr
    -- TfL already lists this station: by code (catches hubs whose averaged
    -- point drifts past 100 m) or by distance (catches codes TfL doesn't use)
    where nr.tfl_naptan_id not in (
        select unnest(naptan_ids) from {{ ref('tfl__stations') }}
    )
    and not exists (
        select 1 from tfl_bng as t
        where ST_DWithin(nr.geom_bng, t.geom_bng, 100)
    )
    -- one physical station can carry several ATCO codes; keep the smallest
    and not exists (
        select 1 from nr as y
        where y.atco_code < nr.atco_code
            and ST_DWithin(nr.geom_bng, y.geom_bng, 100)
    )
),
stations as (
    select * from tfl
    union all
    select * from national_rail
)
select
    stations.station_key,
    stations.name,
    stations.network,
    stations.modes,
    stations.latitude,
    stations.longitude,
    lsoa.lsoa21_code,
    lsoa.borough_code,
    lsoa.lsoa21_code is not null as is_in_london
from stations
left join {{ ref('ons__london_lsoa21') }} as lsoa
    on ST_Contains(
        lsoa.geometry,
        ST_Point(stations.longitude, stations.latitude)
    )
