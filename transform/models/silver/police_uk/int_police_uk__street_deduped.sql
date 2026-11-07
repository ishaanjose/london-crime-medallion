select *
from {{ ref('stg_police_uk__street') }}
qualify source_archive = max(source_archive) over (partition by month, force)
