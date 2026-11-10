select
    lookup.lsoa21_code,
    boundaries.lsoa21_name,
    lookup.borough_code,
    lookup.borough_name,
    boundaries.geometry,
    centroids.pop_centroid
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
left join {{ ref('stg_ons__lsoa21_pop_centroids') }} as centroids
    on lookup.lsoa21_code = centroids.lsoa21_code
