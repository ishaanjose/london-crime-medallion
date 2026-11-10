{{ config(materialized='view') }}

with latest as (
    select *
    from {{ source('naptan', 'rail_stations') }}
    qualify snapshot = max(snapshot) over ()
)
select
    "ATCOCode" as atco_code,
    regexp_replace("CommonName", ' Rail Station$', '') as name,
    ST_Point(cast("Easting" as int), cast("Northing" as int)) as geom_bng,
    -- NaPTAN's lat/lon are derived from the grid and missing for some newer stations
    ST_Y(ST_Transform(geom_bng, 'EPSG:27700', 'EPSG:4326', always_xy := true)) as latitude,
    ST_X(ST_Transform(geom_bng, 'EPSG:27700', 'EPSG:4326', always_xy := true)) as longitude,
    '910G' || substr("ATCOCode", 5) as tfl_naptan_id,
    snapshot,
    batch_id
from latest
where "StopType" = 'RLY'
    and "Status" = 'active'
    -- London's bounding box plus about 5 km, so stations just outside can serve edge LSOAs
    and cast("Easting" as int) between 498000 and 567000
    and cast("Northing" as int) between 150000 and 207000
