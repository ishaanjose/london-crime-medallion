-- dissolve full-detail LSOAs into boroughs before simplifying, so borough edges
-- come from the original geometry; 30 m tolerance in EPSG:27700
with dissolved as (
    select
        borough_code,
        ST_Union_Agg(
            ST_Transform(geometry, 'EPSG:4326', 'EPSG:27700', always_xy := true)
        ) as geometry
    from {{ ref('ons__london_lsoa21') }}
    group by borough_code
)
select
    dissolved.borough_code,
    boroughs.borough_name,
    ST_ReducePrecision(
        ST_Transform(
            ST_SimplifyPreserveTopology(dissolved.geometry, 30),
            'EPSG:27700', 'EPSG:4326', always_xy := true
        ),
        0.00001
    ) as geometry
from dissolved
inner join {{ ref('london_boroughs') }} as boroughs
    on dissolved.borough_code = boroughs.borough_code
