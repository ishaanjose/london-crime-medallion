{{ config(materialized='view') }}

with raw as (
    select
        regexp_extract(filename, 'mode=([^/]+)', 1) as mode,
        regexp_extract(filename, 'snapshot=([^/]+)', 1)::date as snapshot,
        content
    from {{ source('tfl', 'stop_points') }}
    qualify snapshot = max(snapshot) over (partition by mode)
),
stop_points as (
    select unnest(from_json(content -> 'stopPoints', '["json"]')) as sp, mode, snapshot
    from raw
)
select
    sp ->> 'naptanId' as naptan_id,
    sp ->> 'commonName' as name,
    sp ->> 'stopType' as stop_type,
    sp ->> 'hubNaptanCode' as hub_naptan_code,
    (sp ->> 'lat')::double as latitude,
    (sp ->> 'lon')::double as longitude,
    from_json(sp -> 'lines', '[{"id":"VARCHAR"}]') as lines,
    mode,
    snapshot
from stop_points
