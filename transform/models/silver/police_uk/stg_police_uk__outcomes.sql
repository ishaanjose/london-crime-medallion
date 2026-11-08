{{ config(materialized='view') }}

select
    md5(archive || '/' || month || '/' || file_row_number) as record_id,
    nullif("Crime ID", '') as crime_id,
    case
        when lower(filename) like '%-metropolitan-outcomes.csv'
            then 'Metropolitan Police Service'
        when lower(filename) like '%-city-of-london-outcomes.csv'
            then 'City of London Police'
    end as force,
    cast(nullif("Longitude", '') as double) as longitude,
    cast(nullif("Latitude", '') as double) as latitude,
    nullif("Location", '') as location,
    nullif("LSOA code", '') as lsoa_code,
    nullif("LSOA name", '') as lsoa_name,
    nullif("Outcome type", '') as outcome_type,
    nullif(regexp_extract(filename, '[^/]+$'), '') as source_file,
    ingested_at,
    nullif(batch_id, '') as batch_id,
    nullif(archive, '') as source_archive,
    cast(nullif(month, '') || '-01' as date) as outcome_month
from {{ source('police_uk', 'outcomes') }}
