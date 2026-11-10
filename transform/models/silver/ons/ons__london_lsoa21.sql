select
    lookup.lsoa21_code,
    boundaries.lsoa21_name,
    lookup.borough_code,
    lookup.borough_name,
    boundaries.geometry
from (
    select distinct
        lsoa21_code,
        borough_code,
        borough_name
    from {{ ref('stg_ons__lsoa_lookup') }}
    where borough_code like 'E09%'
) as lookup
inner join {{ ref('stg_ons__lsoa21_boundaries') }} as boundaries
    on lookup.lsoa21_code = boundaries.lsoa21_code
