-- latest ingest per source and dataset, with data coverage for the crime sources
-- no "days since ingest" here: now() would freeze at build time; the dashboard computes age on load
with ingestions as (
    select
        source,
        dataset,
        -- newest by publish date, not ingest time: police.uk archives get backfilled out of order,
        -- so the last one ingested is often an old one; ingest time breaks ties and covers
        -- sources with no publish date
        -- version settles a full tie, so the pick is stable
        arg_max(
            version, {'published_at': published_at, 'ingested_at': ingested_at, 'version': version}
        ) as latest_version,
        max(published_at) as latest_published_at,
        max(ingested_at) as last_ingested_at,
        count(*) as ingestions
    from {{ ref('meta__ingestions') }}
    group by source, dataset
),
-- outcomes ride on the police.uk archive ingest, so they borrow its ingestion columns
outcomes as (
    select
        source,
        'outcomes' as dataset,
        latest_version,
        latest_published_at,
        last_ingested_at,
        ingestions
    from ingestions
    where source = 'police_uk' and dataset = 'archive'
),
coverage as (
    select 'police_uk' as source, 'archive' as dataset, min(month) as data_from, max(month) as data_to
    from {{ ref('police_uk__street_crimes') }}
    union all
    select 'police_uk', 'outcomes', min(outcome_month), max(outcome_month)
    from {{ ref('police_uk__outcomes') }}
    union all
    select 'met', 'lsoa crime counts', min(month), max(month)
    from {{ ref('met__lsoa_crime_counts') }}
),
datasets as (
    select * from ingestions
    union all
    select * from outcomes
)
select
    datasets.*,
    coverage.data_from,
    coverage.data_to
from datasets
left join coverage
    on datasets.source = coverage.source
    and datasets.dataset = coverage.dataset
