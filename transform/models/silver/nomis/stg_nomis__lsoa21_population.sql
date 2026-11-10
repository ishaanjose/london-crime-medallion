{{ config(materialized='view') }}

select
    GEOGRAPHY_CODE as lsoa21_code,
    cast(DATE as integer) as mid_year,
    make_date(cast(DATE as integer), 6, 30) as mid_year_date,
    cast(OBS_VALUE as integer) as population,
    release,
    batch_id,
    parse_filename(source_file) as source_file
from {{ source('nomis', 'lsoa21_population') }}
where release = (
    select max(release)
    from {{ source('nomis', 'lsoa21_population') }}
)
