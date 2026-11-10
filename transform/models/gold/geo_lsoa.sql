-- one simplified polygon per LSOA for the web map; simplified in EPSG:27700 so the
-- 10 m tolerance is metres, then back to lat/lon rounded to ~1 m.
-- each polygon is simplified on its own, so shared borders can get hairline gaps;
-- invisible at 10 m, but mapshaper is the fix if they ever show
select
    lsoa21_code,
    ST_ReducePrecision(
        ST_Transform(
            ST_SimplifyPreserveTopology(
                ST_Transform(geometry, 'EPSG:4326', 'EPSG:27700', always_xy := true),
                10
            ),
            'EPSG:27700', 'EPSG:4326', always_xy := true
        ),
        0.00001
    ) as geometry
from {{ ref('ons__london_lsoa21') }}
