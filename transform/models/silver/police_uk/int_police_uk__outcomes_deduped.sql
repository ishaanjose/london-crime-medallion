-- an outcome is a fixed event, so keep one row per event from whichever archive has it;
-- picking one archive per month would take the newest, where that month is thinnest
select *
from {{ ref('stg_police_uk__outcomes') }}
qualify row_number() over (
    partition by force, crime_id, outcome_month, outcome_type
    order by source_archive desc, record_id
) = 1
