-- Any two stations closer than 50 m are almost certainly the same station listed twice
with stations as (
    select
        station_key,
        name,
        network,
        ST_Transform(
            ST_Point(longitude, latitude), 'EPSG:4326', 'EPSG:27700', always_xy := true
        ) as geom_bng
    from {{ ref('transport__stations') }}
)
select
    a.station_key as station_key_a,
    a.name as name_a,
    a.network as network_a,
    b.station_key as station_key_b,
    b.name as name_b,
    b.network as network_b,
    ST_Distance(a.geom_bng, b.geom_bng) as distance_m
from stations as a
inner join stations as b
    on a.station_key < b.station_key
    and ST_DWithin(a.geom_bng, b.geom_bng, 50)
