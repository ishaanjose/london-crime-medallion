{{ config(severity='warn') }}

with monthly_totals as (
    select
        month,
        crime_group,
        sum(crime_count) as crime_count
    from {{ ref('fct_police_uk_crimes_borough_month') }}
    group by 1, 2
),
with_baseline as (
    select
        month,
        crime_group,
        crime_count,
        avg(crime_count) over (
            partition by crime_group
            order by month
            rows between 3 preceding and 1 preceding
        ) as baseline
    from monthly_totals
),
unknown_breaks as (
    select
        current.month,
        current.crime_group,
        current.crime_count,
        current.baseline
    from with_baseline as current
    left join {{ ref('known_data_breaks') }} as known
        on current.crime_group = known.crime_group
        and current.month >= cast(known.month as date)
        and current.month < cast(known.month as date) + interval 4 month
    where known.month is null
      and current.crime_count < 0.5 * current.baseline
      and current.baseline >= 500
)
select
    month,
    crime_group,
    crime_count,
    baseline
from unknown_breaks
