{{ config(materialized='view') }}

select
    PCDS as postcode,
    replace(upper(PCDS), ' ', '') as postcode_key,
    LSOA21CD as lsoa21_code,
    LSOA11CD as lsoa11_code,
    OA21CD as oa21_code,
    MSOA21CD as msoa21_code,
    cast(LAT as double) as latitude,
    cast(LONG as double) as longitude,
    strptime(DOINTR, '%Y%m')::date as introduced_month,
    strptime(DOTERM, '%Y%m')::date as terminated_month,
    DOTERM is null as is_live,
    USRTYPIND = '1' as is_large_user,
    edit,
    batch_id
from {{ source('ons_geography', 'postcodes') }}
qualify edit = max(edit) over ()
