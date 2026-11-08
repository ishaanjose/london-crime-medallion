select
    outcomes.*,
    outcome_type_map.outcome_group,
    outcome_type_map.outcome_stage
from {{ ref('int_police_uk__outcomes_deduped') }} as outcomes
left join {{ ref('police_uk_outcome_type_map') }} as outcome_type_map
    on outcomes.outcome_type = outcome_type_map.outcome_type
