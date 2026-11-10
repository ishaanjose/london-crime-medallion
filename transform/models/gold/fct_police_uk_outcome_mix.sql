-- what happens to crimes: each crime counted once, under its final police-stage outcome
-- (latest month wins, priority breaks ties, so "no suspect" then "charged" counts as Charged)
with bounds as (
    select max(outcome_month) as latest_outcome_month
    from {{ ref('police_uk__outcomes') }}
),
aggregated as (
    select
        borough_code,
        crime_month,
        crime_group,
        force,
        -- set per force and crime month, so it is constant within the group
        is_outcome_data_impaired,
        -- crimes with no outcome keep their own group instead of disappearing
        coalesce(final_outcome_group, 'No outcome recorded') as final_outcome_group,
        count(*) as crimes
    from {{ ref('int_police_uk__crime_outcomes') }}
    group by all
)
select
    aggregated.borough_code,
    london_boroughs.borough_name,
    aggregated.crime_month,
    aggregated.crime_group,
    aggregated.force,
    aggregated.final_outcome_group,
    aggregated.crimes,
    aggregated.is_outcome_data_impaired,
    -- a final outcome can still change for a while, so the same 12-month rule as charge rates
    aggregated.crime_month + interval 12 month <= bounds.latest_outcome_month as is_mature
from aggregated
cross join bounds
inner join {{ ref('london_boroughs') }} as london_boroughs
    on aggregated.borough_code = london_boroughs.borough_code
