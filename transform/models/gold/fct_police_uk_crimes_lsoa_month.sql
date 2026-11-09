select
    lsoa21_code,
    borough_code,
    borough_name,
    month,
    crime_group,
    count(*) as crime_count
from {{ ref('police_uk__street_crimes_lsoa21') }}
where lsoa21_code is not null
group by 1, 2, 3, 4, 5
