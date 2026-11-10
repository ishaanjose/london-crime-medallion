-- crimes per place per full calendar year, at two place levels; anti-social behaviour excluded
-- point: only points with a crime that year (police.uk never publishes empty points)
-- lsoa: every LSOA, zeros included, from the zero-filled fact
with full_years as (
    select year(month) as year
    from {{ ref('fct_police_uk_point_month') }}
    group by year(month)
    having count(distinct month) = 12
),
points as (
    select
        year(month) as year,
        'point' as place_level,
        point_id::varchar as place_id,
        sum(crime_count) as crimes
    from {{ ref('fct_police_uk_point_month') }}
    where crime_group <> 'Anti-social behaviour'
    group by year(month), point_id
),
lsoas as (
    select
        year(month) as year,
        'lsoa' as place_level,
        lsoa21_code as place_id,
        sum(crime_count) as crimes
    from {{ ref('fct_police_uk_lsoa_month') }}
    group by year(month), lsoa21_code
),
places as (
    select * from points
    union all
    select * from lsoas
)
select places.*
from places
inner join full_years
    on places.year = full_years.year
-- police.uk replaced its anonymous map-point set from Dec 2011 and Jul 2022, so in those
-- years one street counts as two places and point-level concentration isn't comparable.
where not (places.place_level = 'point' and places.year in (2011, 2022))
