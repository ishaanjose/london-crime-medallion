{{ config(materialized='table') }}

select
    access.*,
    site.is_in_london
from {{ ref('stg_os__access_points') }} as access
inner join {{ ref('os__greenspace_sites') }} as site
    on access.site_id = site.site_id
