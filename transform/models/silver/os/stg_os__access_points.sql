{{ config(materialized='view') }}

select
    id as access_point_id,
    access_type,
    ref_to_greenspace_site as site_id,
    geometry,
    version,
    batch_id
from {{ source('os_open_greenspace', 'access_point') }}
qualify version = max(version) over ()
