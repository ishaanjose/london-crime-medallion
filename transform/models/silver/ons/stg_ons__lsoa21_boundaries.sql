{{ config(materialized='view') }}

select
    feature.properties.lsoa21cd as lsoa21_code,
    feature.properties.lsoa21nm as lsoa21_name,
    feature.geometry as geometry,
    edit as source_edit
from (
    select
        unnest(features) as feature,
        edit
    from {{ source('ons_geography', 'lsoa21_boundaries') }}
)
qualify source_edit = max(source_edit) over ()
