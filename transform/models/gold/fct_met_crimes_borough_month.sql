select
    borough_code,
    borough_name,
    month,
    crime_group,
    sum(crime_count) as crime_count
from {{ ref('fct_met_crimes_lsoa_month') }}
group by 1, 2, 3, 4
