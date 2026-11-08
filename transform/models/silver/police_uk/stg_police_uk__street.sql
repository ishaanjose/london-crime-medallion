{{ config(materialized='view') }}

select
    md5(archive || '/' || month || '/' || file_row_number) as record_id,
    nullif("Crime ID", '') as crime_id,
    case
        when lower(filename) like '%-metropolitan-street.csv'
            then 'Metropolitan Police Service'
        when lower(filename) like '%-city-of-london-street.csv'
            then 'City of London Police'
    end as force,
    cast(nullif("Longitude", '') as double) as longitude,
    cast(nullif("Latitude", '') as double) as latitude,
    nullif("Location", '') as location,
    nullif("LSOA code", '') as lsoa_code,
    nullif("LSOA name", '') as lsoa_name,
    nullif("Crime type", '') as crime_type,
    nullif("Last outcome category", '') as last_outcome_category,
    nullif("Context", '') as context,
    nullif(regexp_extract(filename, '[^/]+$'), '') as source_file,
    ingested_at,
    nullif(batch_id, '') as batch_id,
    nullif(archive, '') as source_archive,
    cast(nullif(month, '') || '-01' as date) as month
from {{ source('police_uk', 'street') }}
