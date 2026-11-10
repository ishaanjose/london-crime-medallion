{{ config(materialized='table') }}

select
    ST_Union_Agg(
        ST_Transform(
            geometry,
            'EPSG:4326',
            'EPSG:27700',
            always_xy := true
        )
    ) as geometry
from {{ ref('ons__london_lsoa21') }}
