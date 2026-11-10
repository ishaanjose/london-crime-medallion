-- one row per crime with its police outcome history condensed; court outcomes are excluded
with crimes as (
    -- a crime_id can span several offence rows; the first one describes the incident
    select
        crime_id,
        arg_min(month, record_id) as crime_month,
        arg_min(lsoa21_code, record_id) as lsoa21_code,
        arg_min(borough_code, record_id) as borough_code,
        arg_min(crime_group, record_id) as crime_group
    from {{ ref('int_police_uk__street_dedup_source') }}
    where crime_id is not null
        and lsoa21_code is not null
    group by crime_id
),
outcomes as (
    -- distinct drops outcome rows republished verbatim
    select distinct
        crime_id,
        outcome_month,
        outcome_group,
        outcome_priority
    from {{ ref('police_uk__outcomes') }}
    where outcome_stage = 'police'
),
per_crime as (
    select
        crime_id,
        min(outcome_month) filter (where outcome_group = 'Charged') as first_charge_month,
        max(outcome_month) as last_outcome_month,
        -- latest month wins; within a month, the lowest priority wins
        arg_min(outcome_group, (-epoch(outcome_month), outcome_priority)) as final_outcome_group,
        count(*) as outcome_count
    from outcomes
    group by crime_id
)
select
    crimes.crime_id,
    crimes.crime_month,
    crimes.lsoa21_code,
    crimes.borough_code,
    crimes.crime_group,
    per_crime.first_charge_month,
    per_crime.last_outcome_month,
    per_crime.final_outcome_group,
    per_crime.outcome_count,
    per_crime.first_charge_month is not null as ever_charged,
    date_diff('month', crimes.crime_month, per_crime.first_charge_month) as months_to_charge,
    per_crime.final_outcome_group is null as has_no_outcome
from crimes
left join per_crime
    on crimes.crime_id = per_crime.crime_id
