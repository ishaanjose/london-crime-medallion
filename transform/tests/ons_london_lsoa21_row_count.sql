select count(*) as row_count
from {{ ref('ons__london_lsoa21') }}
having count(*) <> 4994
