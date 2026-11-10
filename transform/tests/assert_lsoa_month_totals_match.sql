-- zero-filling must never change the totals
with filled as (
    select sum(crime_count + asb_count) as total
    from {{ ref('fct_police_uk_lsoa_month') }}
),
source as (
    select sum(crime_count) as total
    from {{ ref('fct_police_uk_crimes_lsoa_month') }}
)
select
    filled.total as filled_total,
    source.total as source_total
from filled
cross join source
where filled.total is distinct from source.total
