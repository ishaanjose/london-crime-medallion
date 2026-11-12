-- fails if crimes from a crime group with a registered coverage gap reach the concentration
-- inputs: each year x place level total in int_police_uk__place_year_crimes must equal the
-- fact total with ASB and every gap group (open, or overlapping any year in the series) removed
with years as (
    select distinct year
    from {{ ref('int_police_uk__place_year_crimes') }}
),
gap_groups as (
    select distinct gaps.crime_group
    from {{ ref('known_crime_gaps') }} as gaps
    where gaps.end_month is null
        or exists (
            select 1
            from years
            where gaps.start_month::date <= make_date(years.year, 12, 1)
                and gaps.end_month::date >= make_date(years.year, 1, 1)
        )
),
expected as (
    select year(month) as year, 'point' as place_level, sum(crime_count) as crimes
    from {{ ref('fct_police_uk_point_month') }}
    where crime_group <> 'Anti-social behaviour'
        and crime_group not in (select crime_group from gap_groups)
        and year(month) not in (2011, 2022)
    group by 1
    union all
    select year(month), 'lsoa', sum(crime_count)
    from {{ ref('fct_police_uk_crimes_lsoa_month') }}
    where crime_group <> 'Anti-social behaviour'
        and crime_group not in (select crime_group from gap_groups)
    group by 1
),
actual as (
    select year, place_level, sum(crimes) as crimes
    from {{ ref('int_police_uk__place_year_crimes') }}
    group by 1, 2
)
select
    actual.year,
    actual.place_level,
    actual.crimes as actual_crimes,
    expected.crimes as expected_crimes
from actual
left join expected
    on actual.year = expected.year
    and actual.place_level = expected.place_level
where expected.crimes is distinct from actual.crimes
