-- every known issue from the four seeds as one timeline; null end_month means still in effect
select
    'data break' as issue_type,
    'police_uk' as source,
    crime_group as scope,
    month::date as start_month,
    month::date as end_month,
    null as severity,
    reason as description,
    'excluded from crime anomaly tests for 4 months' as handling
from {{ ref('known_data_breaks') }}
union all
select
    'duplicate publication',
    'police_uk',
    force || ' ' || crime_type,
    month::date,
    month::date,
    null,
    reason,
    'identical rows halved in silver'
from {{ ref('duplicated_source_months') }}
union all
select
    'outcome gap',
    'police_uk',
    force,
    start_month::date,
    end_month::date,
    severity,
    reason,
    case severity
        when 'degraded' then 'charge rates flagged impaired'
        when 'collapsed' then 'charge rates flagged impaired'
        when 'step' then 'excluded from outcome collapse test'
    end
from {{ ref('known_outcome_gaps') }}
union all
select
    change_type,
    source,
    source,
    start_month::date,
    end_month::date,
    null,
    description,
    handling
from {{ ref('known_source_changes') }}
union all
select
    'coverage gap',
    'police_uk',
    crime_group,
    start_month::date,
    end_month::date,
    null,
    force || ': ' || reason,
    'excluded from year-on-year comparisons while in effect'
from {{ ref('known_crime_gaps') }}
