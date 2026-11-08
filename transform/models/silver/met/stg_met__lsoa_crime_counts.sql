{{ config(materialized='view') }}

select
    "LSOA Code" as lsoa_code,
    "LSOA Name" as lsoa_name,
    "Borough" as borough_code,
    "Group" as ho_major_category,
    "SubGroup" as ho_minor_category,
    strptime(month, '%Y%m')::date as month,
    cast(crime_count as integer) as crime_count,
    release as source_release,
    regexp_extract(filename, '[^/]+$') as source_file,
    ingested_at,
    batch_id
from (
    unpivot ({{ source('met_datastore', 'lsoa') }})
    on columns('^\d{6}$')
    into name month value crime_count
)
where cast(crime_count as integer) > 0
