select
    nullif("Crime ID", '') as crime_id,
    nullif("Reported by", '') as force,
    cast(nullif("Longitude", '') as double) as longitude,
    cast(nullif("Latitude", '') as double) as latitude,
    nullif("Location", '') as location,
    nullif("LSOA code", '') as lsoa_code,
    nullif("LSOA name", '') as lsoa_name,
    nullif("Crime type", '') as crime_type,
    nullif("Last outcome category", '') as last_outcome_category,
    nullif("Context", '') as context,
    nullif(regexp_extract(filename, '[^/]+$'), '') as source_file,
    cast(ingested_at as timestamp) as ingested_at,
    nullif(batch_id, '') as batch_id,
    nullif(archive, '') as source_archive,
    cast(nullif(month, '') || '-01' as date) as month
from {{ source('police_uk', 'street') }}
