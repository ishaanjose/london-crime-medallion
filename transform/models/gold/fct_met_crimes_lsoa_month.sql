select
    ons.lsoa21_code,
    ons.borough_code,
    ons.borough_name,
    met.month,
    met.crime_group,
    sum(met.crime_count) as crime_count
from {{ ref('met__lsoa_crime_counts') }} as met
inner join {{ ref('ons__london_lsoa21') }} as ons
    on met.lsoa_code = ons.lsoa21_code
group by 1, 2, 3, 4, 5
