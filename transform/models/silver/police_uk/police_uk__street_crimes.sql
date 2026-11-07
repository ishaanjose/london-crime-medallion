select
    street.*,
    crime_type_map.crime_group
from {{ ref('int_police_uk__street_deduped') }} as street
left join {{ ref('police_uk_crime_type_map') }} as crime_type_map
    on street.crime_type = crime_type_map.crime_type
