-- every London crime with coordinates must land on exactly one map point
with fact as (
    select sum(crime_count) as total
    from {{ ref('fct_police_uk_point_month') }}
),
source as (
    select count(*) as total
    from {{ ref('int_police_uk__street_dedup_source') }}
    where lsoa21_code is not null
        and longitude is not null
)
select
    fact.total as fact_total,
    source.total as source_total
from fact
cross join source
where fact.total is distinct from source.total
