-- crimes per place per full calendar year, at two place levels; anti-social behaviour excluded,
-- and so is any crime group with a registered police.uk coverage gap (known_crime_gaps)
-- point: only points with a crime that year (police.uk never publishes empty points)
-- lsoa: every LSOA, zeros included, filled against dim_lsoa
with full_years as (
    select year(month) as year
    from {{ ref('fct_police_uk_point_month') }}
    group by year(month)
    having count(distinct month) = 12
),
-- a gap group is dropped from every year, so the series stays like-for-like, when its gap is
-- still open or overlaps any full year in the series; end_month is the last affected month
excluded_groups as (
    select distinct gaps.crime_group
    from {{ ref('known_crime_gaps') }} as gaps
    where gaps.end_month is null
        or exists (
            select 1
            from full_years
            where gaps.start_month::date <= make_date(full_years.year, 12, 1)
                and gaps.end_month::date >= make_date(full_years.year, 1, 1)
        )
),
points as (
    select
        year(month) as year,
        'point' as place_level,
        point_id::varchar as place_id,
        sum(crime_count) as crimes
    from {{ ref('fct_police_uk_point_month') }}
    where crime_group <> 'Anti-social behaviour'
        and crime_group not in (select crime_group from excluded_groups)
    group by year(month), point_id
),
lsoa_counts as (
    select
        year(month) as year,
        lsoa21_code,
        sum(crime_count) as crimes
    from {{ ref('fct_police_uk_crimes_lsoa_month') }}
    where crime_group <> 'Anti-social behaviour'
        and crime_group not in (select crime_group from excluded_groups)
    group by year(month), lsoa21_code
),
lsoas as (
    select
        full_years.year,
        'lsoa' as place_level,
        dim_lsoa.lsoa21_code as place_id,
        coalesce(lsoa_counts.crimes, 0) as crimes
    from {{ ref('dim_lsoa') }} as dim_lsoa
    cross join full_years
    left join lsoa_counts
        on dim_lsoa.lsoa21_code = lsoa_counts.lsoa21_code
        and full_years.year = lsoa_counts.year
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
