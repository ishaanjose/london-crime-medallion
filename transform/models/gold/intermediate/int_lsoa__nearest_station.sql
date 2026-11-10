with lsoas as (
    select
        lsoa21_code,
        ST_Transform(pop_centroid, 'EPSG:4326', 'EPSG:27700', always_xy := true) as centroid_bng
    from {{ ref('ons__london_lsoa21') }}
),
-- all TfL and National Rail stations, including those outside London, so edge LSOAs can match across the boundary
stations as (
    select
        station_key,
        name,
        network,
        ST_Transform(
            ST_Point(longitude, latitude), 'EPSG:4326', 'EPSG:27700', always_xy := true
        ) as station_bng
    from {{ ref('transport__stations') }}
),
pairs as (
    select
        lsoas.lsoa21_code,
        stations.station_key,
        stations.name,
        stations.network,
        ST_Distance(lsoas.centroid_bng, stations.station_bng) as distance_m
    from lsoas
    cross join stations
)
select
    lsoa21_code,
    round(min(distance_m))::integer as nearest_station_m,
    arg_min(name, distance_m) as nearest_station_name,
    arg_min(station_key, distance_m) as nearest_station_key,
    arg_min(network, distance_m) as nearest_station_network,
    count(*) filter (where distance_m <= 1000) as stations_within_1km
from pairs
group by lsoa21_code
