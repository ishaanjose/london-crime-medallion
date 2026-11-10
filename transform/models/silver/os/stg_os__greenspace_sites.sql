{{ config(materialized='view') }}

select
    id as site_id,
    function as site_function,
    distinctive_name_1 as name,
    geometry,
    version,
    batch_id
from {{ source('os_open_greenspace', 'greenspace_site') }}
qualify version = max(version) over ()
