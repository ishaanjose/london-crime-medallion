select *
from {{ ref('stg_met__lsoa_crime_counts') }}
qualify source_release = max(source_release) over (partition by month)
