-- aggregating to borough x month x crime group x force must keep every crime
with fact as (
    select sum(crimes) as total
    from {{ ref('fct_police_uk_charge_rates') }}
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
