-- rolling up LSOA -> borough -> London must never change the crime total
with lsoa as (
    select sum(crime_count) as total
    from {{ ref('fct_police_uk_lsoa_month') }}
),
borough as (
    select sum(crime_count) as total
    from {{ ref('fct_police_uk_borough_month') }}
),
london as (
    select sum(crime_count) as total
    from {{ ref('fct_police_uk_london_month') }}
)
select
    lsoa.total as lsoa_total,
    borough.total as borough_total,
    london.total as london_total
from lsoa
cross join borough
cross join london
where lsoa.total is distinct from borough.total
    or lsoa.total is distinct from london.total
