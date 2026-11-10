-- charged within 12 months of the crime, only once every crime month has had the full 12 months;
-- a naive charge rate falls off at the right edge because recent crimes haven't had time to be charged
with bounds as (
    select max(outcome_month) as latest_outcome_month
    from {{ ref('police_uk__outcomes') }}
),
-- crimes with a crime ID only; anti-social behaviour has none, so it's excluded
aggregated as (
    select
        borough_code,
        crime_month,
        crime_group,
        count(*) as crimes,
        count(*) filter (where months_to_charge <= 12) as charged_within_12m,
        count(*) filter (where ever_charged) as charged_ever,
        bool_or(is_outcome_data_impaired) as is_outcome_data_impaired
    from {{ ref('int_police_uk__crime_outcomes') }}
    group by borough_code, crime_month, crime_group
)
select
    aggregated.borough_code,
    london_boroughs.borough_name,
    aggregated.crime_month,
    aggregated.crime_group,
    aggregated.crimes,
    aggregated.charged_within_12m,
    aggregated.charged_ever,
    aggregated.is_outcome_data_impaired,
    aggregated.crime_month + interval 12 month <= bounds.latest_outcome_month as is_mature,
    -- null until mature, so it reads as not yet known rather than falsely low
    case
        when aggregated.crime_month + interval 12 month <= bounds.latest_outcome_month
            then round(aggregated.charged_within_12m / aggregated.crimes, 4)
    end as charge_rate_12m
from aggregated
cross join bounds
inner join {{ ref('london_boroughs') }} as london_boroughs
    on aggregated.borough_code = london_boroughs.borough_code
