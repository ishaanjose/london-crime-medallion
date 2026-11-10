select
    lsoa21_code,
    borough_code,
    borough_name,
    month,
    crime_group,
    count(*) as crime_count
from {{ ref('int_police_uk__street_dedup_source') }}
where lsoa21_code is not null
group by 1, 2, 3, 4, 5
