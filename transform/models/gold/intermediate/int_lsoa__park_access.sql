with lsoas as (
    select
        lsoa21_code,
        ST_Transform(pop_centroid, 'EPSG:4326', 'EPSG:27700', always_xy := true) as centroid_bng
    from {{ ref('ons__london_lsoa21') }}
),
-- parks just outside London are kept so edge LSOAs can match across the boundary
parks as (
    select
        site_id,
        name,
        geometry
    from {{ ref('os__greenspace_sites') }}
    where site_function in ('Public Park Or Garden', 'Playing Field')
),
-- car-park-only entrances aren't a way in on foot
entrances as (
    select
        access.site_id,
        parks.name,
        access.geometry
    from {{ ref('os__access_points') }} as access
    inner join parks
        on access.site_id = parks.site_id
    where access.access_type <> 'Motor Vehicle'
),
-- ST_DWithin lets DuckDB plan a spatial join instead of a full cross join
nearest as (
    select
        lsoas.lsoa21_code,
        round(min(ST_Distance(lsoas.centroid_bng, entrances.geometry)))::integer
            as nearest_park_entrance_m,
        arg_min(entrances.site_id, ST_Distance(lsoas.centroid_bng, entrances.geometry))
            as nearest_park_site_id,
        -- arg_min skips null names and would return a different, named park; arg_min_null doesn't
        arg_min_null(entrances.name, ST_Distance(lsoas.centroid_bng, entrances.geometry))
            as nearest_park_name
    from lsoas
    inner join entrances
        on ST_DWithin(lsoas.centroid_bng, entrances.geometry, 5000)
    group by lsoas.lsoa21_code
),
-- union before measuring: OS sites overlap (playing fields inside parks), so summing would double count
area as (
    select
        lsoas.lsoa21_code,
        ST_Area(
            ST_Union_Agg(ST_Intersection(parks.geometry, ST_Buffer(lsoas.centroid_bng, 1000)))
        ) / 10000 as park_ha_within_1km
    from lsoas
    inner join parks
        on ST_Intersects(parks.geometry, ST_Buffer(lsoas.centroid_bng, 1000))
    group by lsoas.lsoa21_code
)
select
    lsoas.lsoa21_code,
    nearest.nearest_park_entrance_m,
    nearest.nearest_park_site_id,
    nearest.nearest_park_name,
    coalesce(area.park_ha_within_1km, 0) as park_ha_within_1km
from lsoas
left join nearest
    on lsoas.lsoa21_code = nearest.lsoa21_code
left join area
    on lsoas.lsoa21_code = area.lsoa21_code
