-- police.uk snaps every crime to a fixed anonymised map point ("On or near ..."),
-- so the honest map unit is the point, not the crime
with points as (
    select
        longitude,
        latitude,
        -- almost always a single value per point
        mode(location) as location,
        mode(lsoa21_code) as lsoa21_code,
        mode(borough_code) as borough_code,
        count(*) as total_crimes
    from {{ ref('int_police_uk__street_dedup_source') }}
    where lsoa21_code is not null
        and longitude is not null
    group by longitude, latitude
)
select
    -- small integer keeps the web export compact; stable only within one build,
    -- which is fine because this dim and fct_police_uk_point_month always rebuild together
    dense_rank() over (order by longitude, latitude) as point_id,
    longitude,
    latitude,
    location,
    lsoa21_code,
    borough_code,
    total_crimes
from points
