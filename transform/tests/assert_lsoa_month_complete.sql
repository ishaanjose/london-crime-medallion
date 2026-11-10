-- every LSOA must appear in every month
with actual as (
    select
        count(*) as row_count,
        count(distinct month) as month_count
    from {{ ref('fct_police_uk_lsoa_month') }}
),
lsoas as (
    select count(*) as lsoa_count
    from {{ ref('dim_lsoa') }}
)
select
    actual.row_count,
    lsoas.lsoa_count * actual.month_count as expected_row_count
from actual
cross join lsoas
where actual.row_count != lsoas.lsoa_count * actual.month_count
