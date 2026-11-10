select *
from {{ ref('stg_ons__lsoa_lookup') }}
where borough_code like 'E09%'
  and change_indicator = 'X'
