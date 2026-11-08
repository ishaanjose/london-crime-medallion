select
    london_boroughs.borough_code,
    london_boroughs.borough_name,
    crimes.month,
    crimes.crime_group,
    sum(crimes.crime_count) as crime_count
from {{ ref('met__lsoa_crime_counts') }} as crimes
inner join {{ ref('london_boroughs') }} as london_boroughs
    on crimes.borough_code = london_boroughs.borough_code
group by 1, 2, 3, 4
