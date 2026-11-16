-- one row per crime with its police outcome history condensed; court outcomes are excluded
with first_offences as (
    -- a crime_id can span several offence rows; the earliest one describes the incident.
    -- Same-month ties break on an md5 of the row's content, not on record_id, which changes
    -- whenever bronze is rewritten. md5 spreads ties evenly like the old pick did; an alphabetical
    -- tie-break would always push multi-offence crimes out of Violence. md5 (unlike hash()) is
    -- stable across DuckDB versions, and every column comes from the one picked row
    select
        crime_id,
        arg_min(
            {
                'crime_month': month,
                'crime_group': crime_group,
                'lsoa21_code': lsoa21_code,
                'borough_code': borough_code,
                'force': force
            },
            (
                month,
                md5(concat_ws('|', crime_id, crime_group, lsoa21_code, borough_code, force)),
                crime_group,
                lsoa21_code,
                borough_code,
                force
            )
        ) as first_offence
    from {{ ref('int_police_uk__street_dedup_source') }}
    where crime_id is not null
        and lsoa21_code is not null
    group by crime_id
),
crimes as (
    select
        crime_id,
        first_offence.crime_month,
        first_offence.lsoa21_code,
        first_offence.borough_code,
        first_offence.crime_group,
        first_offence.force
    from first_offences
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
        -- latest month wins; within a month, the lowest priority wins; the group name settles
        -- any remaining tie, should a seed change ever give two groups the same priority
        arg_min(
            outcome_group, (-epoch(outcome_month), outcome_priority, outcome_group)
        ) as final_outcome_group,
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
    crimes.force,
    per_crime.first_charge_month,
    per_crime.last_outcome_month,
    per_crime.final_outcome_group,
    per_crime.outcome_count,
    per_crime.first_charge_month is not null as ever_charged,
    date_diff('month', crimes.crime_month, per_crime.first_charge_month) as months_to_charge,
    per_crime.final_outcome_group is null as has_no_outcome,
    -- the crime's 12-month follow-up window overlaps a known degraded or collapsed gap for its force
    exists (
        select 1
        from {{ ref('known_outcome_gaps') }} as gaps
        where gaps.force = crimes.force
            and gaps.severity in ('degraded', 'collapsed')
            and cast(gaps.start_month as date) <= crimes.crime_month + interval 12 month
            and cast(gaps.end_month as date) >= crimes.crime_month
    ) as is_outcome_data_impaired
from crimes
left join per_crime
    on crimes.crime_id = per_crime.crime_id
