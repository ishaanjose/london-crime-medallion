select *
from {{ ref('stg_police_uk__outcomes') }}
qualify source_archive = max(source_archive) over (partition by outcome_month, force)
