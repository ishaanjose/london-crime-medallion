select
    postcodes.*,
    lsoa.borough_code
from {{ ref('stg_ons__postcodes') }} as postcodes
inner join {{ ref('ons__london_lsoa21') }} as lsoa
    on postcodes.lsoa21_code = lsoa.lsoa21_code
