select lsoa21_code
from {{ ref('ons__london_lsoa21') }}
where not ST_Contains(geometry, pop_centroid)
