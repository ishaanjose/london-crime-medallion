with date_bounds as (
    select
        greatest(
            (select min(month) from {{ ref('fct_police_uk_crimes_borough_month') }}),
            (select min(month) from {{ ref('fct_met_crimes_borough_month') }})
        ) as overlap_start,
        least(
            (select max(month) from {{ ref('fct_police_uk_crimes_borough_month') }}),
            (select max(month) from {{ ref('fct_met_crimes_borough_month') }})
        ) as overlap_end
),
police_uk as (
    select *
    from {{ ref('fct_police_uk_crimes_borough_month') }}
    where crime_group <> 'Anti-social behaviour'
),
met as (
    select *
    from {{ ref('fct_met_crimes_borough_month') }}
    where crime_group <> 'Anti-social behaviour'
),
joined as (
    select
        coalesce(police_uk.borough_code, met.borough_code) as borough_code,
        coalesce(police_uk.borough_name, met.borough_name) as borough_name,
        coalesce(police_uk.month, met.month) as month,
        coalesce(police_uk.crime_group, met.crime_group) as crime_group,
        coalesce(police_uk.crime_count, 0) as police_uk_count,
        coalesce(met.crime_count, 0) as met_count
    from police_uk
    full outer join met
        on police_uk.borough_code = met.borough_code
        and police_uk.month = met.month
        and police_uk.crime_group = met.crime_group
    cross join date_bounds
    where coalesce(police_uk.month, met.month)
        between date_bounds.overlap_start and date_bounds.overlap_end
)
select
    borough_code,
    borough_name,
    month,
    crime_group,
    police_uk_count,
    met_count,
    police_uk_count - met_count as difference,
    (police_uk_count - met_count) / nullif(met_count, 0) as pct_difference
from joined
