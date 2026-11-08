select
    london_boroughs.borough_code,
    london_boroughs.borough_name,
    crimes.month,
    crimes.crime_group,
    count(*) as crime_count
from {{ ref('police_uk__street_crimes') }} as crimes
inner join {{ ref('london_boroughs') }} as london_boroughs
    on {{ borough_from_lsoa_name('crimes.lsoa_name') }} = london_boroughs.borough_name
group by 1, 2, 3, 4
