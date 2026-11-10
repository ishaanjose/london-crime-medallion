-- every one of the 33 boroughs must appear in every month
with actual as (
    select
        count(*) as row_count,
        count(distinct month) as month_count
    from {{ ref('fct_police_uk_borough_month') }}
)
select
    row_count,
    33 * month_count as expected_row_count
from actual
where row_count != 33 * month_count
