-- every manifest entry as a row: what each ingest landed and when
-- read_json already parses ISO dates, so date-only versions are formatted in UTC
-- rather than with left(), which would use the session time zone
{% set utc_day = "strftime(timezone('UTC', {}::timestamptz), '%Y-%m-%d')" %}
select
    'police_uk' as source,
    'archive' as dataset,
    archiveName::varchar as version,
    lastModified::timestamptz as published_at,
    ingestedAt::timestamptz as ingested_at
from {{ source('manifests', 'police_uk') }}
union all
select
    'met',
    'lsoa crime counts',
    releaseDate::varchar,
    releaseDate::timestamptz,
    ingestedAt::timestamptz
from {{ source('manifests', 'met') }}
union all
select
    'ons',
    layerName,
    {{ utc_day.format('dataLastEditDate') }},
    dataLastEditDate::timestamptz,
    ingestedAt::timestamptz
from {{ source('manifests', 'ons') }}
union all
select
    'nomis',
    'lsoa21 population',
    lastUpdated::varchar,
    lastUpdated::timestamptz,
    ingestedAt::timestamptz
from {{ source('manifests', 'nomis') }}
union all
select
    'imd',
    release,
    etag::varchar,
    lastModified::timestamptz,
    ingestedAt::timestamptz
from {{ source('manifests', 'imd') }}
union all
-- TfL, OS and NaPTAN publish no date
select
    'tfl',
    mode,
    left(md5, 8),
    null::timestamptz,
    ingestedAt::timestamptz
from {{ source('manifests', 'tfl') }}
union all
select
    'greenspace',
    'open greenspace',
    version::varchar,
    null::timestamptz,
    ingestedAt::timestamptz
from {{ source('manifests', 'greenspace') }}
union all
select
    'naptan',
    'rail stations',
    left(md5, 8),
    null::timestamptz,
    ingestedAt::timestamptz
from {{ source('manifests', 'naptan') }}
