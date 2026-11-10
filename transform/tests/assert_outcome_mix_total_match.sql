-- every crime must land in exactly one final outcome group
with fact as (
    select sum(crimes) as total
    from {{ ref('fct_police_uk_outcome_mix') }}
),
crimes as (
    select count(*) as total
    from {{ ref('int_police_uk__crime_outcomes') }}
)
select
    fact.total as fact_total,
    crimes.total as crimes_total
from fact
cross join crimes
where fact.total is distinct from crimes.total
