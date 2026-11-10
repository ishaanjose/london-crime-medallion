-- London baseline for "vs London" comparisons; rolled up from borough counts, not rates
with london_month as (
    select
        month,
        sum(crime_count) as crime_count,
        sum(asb_count) as asb_count,
        sum(population) as population
    from {{ ref('fct_police_uk_borough_month') }}
    group by month
),
rolling as (
    select
        london_month.*,
        sum(crime_count) over trailing_12 as crime_count_12m,
        count(*) over trailing_12 as months_in_window
    from london_month
    window trailing_12 as (
        order by month
        rows between 11 preceding and current row
    )
)
select
    month,
    crime_count,
    asb_count,
    population,
    round(crime_count * 1000.0 / population, 3) as crimes_per_1000,
    -- null until a full 12 months are available
    case when months_in_window = 12 then crime_count_12m end as crime_count_12m,
    case
        when months_in_window = 12
            then round(crime_count_12m * 1000.0 / population, 3)
    end as crimes_per_1000_12m
from rolling
