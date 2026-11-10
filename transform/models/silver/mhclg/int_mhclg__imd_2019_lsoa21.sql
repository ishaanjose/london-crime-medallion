{{ config(materialized='view') }}

with imd_long as (
    select lsoa11_code, population, 'imd' as measure, imd_score as score,
        imd_decile as decile, imd_rank as rank
    from {{ ref('stg_mhclg__imd_2019') }}
    union all
    select lsoa11_code, population, 'income', income_score, income_decile, null
    from {{ ref('stg_mhclg__imd_2019') }}
    union all
    select lsoa11_code, population, 'employment', employment_score, employment_decile, null
    from {{ ref('stg_mhclg__imd_2019') }}
    union all
    select lsoa11_code, population, 'education', education_score, education_decile, null
    from {{ ref('stg_mhclg__imd_2019') }}
    union all
    select lsoa11_code, population, 'health', health_score, health_decile, null
    from {{ ref('stg_mhclg__imd_2019') }}
    union all
    select lsoa11_code, population, 'crime', crime_score, crime_decile, null
    from {{ ref('stg_mhclg__imd_2019') }}
    union all
    select lsoa11_code, population, 'barriers', barriers_score, barriers_decile, null
    from {{ ref('stg_mhclg__imd_2019') }}
    union all
    select lsoa11_code, population, 'living_environment', living_environment_score,
        living_environment_decile, null
    from {{ ref('stg_mhclg__imd_2019') }}
),
cutoffs as (
    select measure, decile, min(score) as min_score
    from imd_long
    group by measure, decile
),
lookup as (
    select lsoa11_code, lsoa21_code, change_indicator
    from {{ ref('stg_ons__lsoa_lookup') }}
    where borough_code like 'E09%'
),
mapped as (
    select
        lookup.lsoa21_code,
        imd_long.measure,
        sum(imd_long.score * imd_long.population) / sum(imd_long.population) as score,
        count(*) as parent_count,
        any_value(imd_long.decile) as parent_decile,
        any_value(imd_long.rank) as parent_rank,
        any_value(lookup.change_indicator) as change_indicator
    from lookup
    inner join imd_long
        on lookup.lsoa11_code = imd_long.lsoa11_code
    group by lookup.lsoa21_code, imd_long.measure
)
select
    lsoa21_code,
    measure,
    score,
    case
        when parent_count = 1 then parent_decile
        else 1 + (
            select count(*)
            from cutoffs
            where cutoffs.measure = mapped.measure
              and cutoffs.min_score > mapped.score
        )
    end as decile,
    case when parent_count = 1 then parent_rank end as rank,
    parent_count,
    change_indicator,
    case change_indicator
        when 'U' then 'unchanged'
        when 'S' then 'split'
        when 'M' then 'merged'
    end as mapping_method,
    'iod2019' as release
from mapped
