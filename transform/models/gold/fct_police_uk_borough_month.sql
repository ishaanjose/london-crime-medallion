-- rates roll up from summed counts and population, never from averaged LSOA rates
with borough_month as (
    select
        lsoa_month.borough_code,
        lsoa_month.month,
        sum(lsoa_month.crime_count) as crime_count,
        sum(lsoa_month.asb_count) as asb_count,
        sum(lsoa_month.population) as population
    from {{ ref('fct_police_uk_lsoa_month') }} as lsoa_month
    group by lsoa_month.borough_code, lsoa_month.month
),
rolling as (
    select
        borough_month.*,
        sum(crime_count) over trailing_12 as crime_count_12m,
        count(*) over trailing_12 as months_in_window
    from borough_month
    window trailing_12 as (
        partition by borough_code
        order by month
        rows between 11 preceding and current row
    )
)
select
    rolling.borough_code,
    london_boroughs.borough_name,
    rolling.month,
    rolling.crime_count,
    rolling.asb_count,
    rolling.population,
    round(rolling.crime_count * 1000.0 / rolling.population, 3) as crimes_per_1000,
    -- null until a full 12 months are available
    case when rolling.months_in_window = 12 then rolling.crime_count_12m end as crime_count_12m,
    case
        when rolling.months_in_window = 12
            then round(rolling.crime_count_12m * 1000.0 / rolling.population, 3)
    end as crimes_per_1000_12m
from rolling
inner join {{ ref('london_boroughs') }} as london_boroughs
    on rolling.borough_code = london_boroughs.borough_code
