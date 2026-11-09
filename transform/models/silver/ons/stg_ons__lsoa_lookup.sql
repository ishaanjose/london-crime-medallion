{{ config(materialized='view') }}

select
    LSOA11CD as lsoa11_code,
    LSOA11NM as lsoa11_name,
    LSOA21CD as lsoa21_code,
    LSOA21NM as lsoa21_name,
    CHGIND as change_indicator,
    LAD22CD as borough_code,
    LAD22NM as borough_name,
    edit as source_edit
from {{ source('ons_geography', 'lsoa_lookup') }}
qualify source_edit = max(source_edit) over ()
