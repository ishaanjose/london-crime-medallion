select
    counts.*,
    category_map.crime_group
from {{ ref('int_met__lsoa_crime_counts_deduped') }} as counts
left join {{ ref('met_crime_category_map') }} as category_map
    on counts.ho_major_category = category_map.ho_major_category
