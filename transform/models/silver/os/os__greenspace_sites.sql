{{ config(materialized='table') }}

with london as (
    select geometry
    from {{ ref('ons__london_boundary') }}
),
near_london as (
    select site.*
    from {{ ref('stg_os__greenspace_sites') }} as site
    cross join london
    where ST_Intersects(
        site.geometry,
        ST_Buffer(ST_Envelope(london.geometry), 2000)
    )
      and ST_DWithin(site.geometry, london.geometry, 2000)
)
select
    site.*,
    ST_Intersects(site.geometry, london.geometry) as is_in_london,
    ST_Area(site.geometry) / 10000 as area_hectares
from near_london as site
cross join london
