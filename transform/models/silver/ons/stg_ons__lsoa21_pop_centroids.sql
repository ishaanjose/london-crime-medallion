{{ config(materialized='view') }}

select
    feature.properties.lsoa21cd as lsoa21_code,
    feature.geometry as pop_centroid,
    edit as source_edit
from (
    select
        unnest(features) as feature,
        edit
    from {{ source('ons_geography', 'lsoa21_pop_centroids') }}
)
qualify source_edit = max(source_edit) over ()
