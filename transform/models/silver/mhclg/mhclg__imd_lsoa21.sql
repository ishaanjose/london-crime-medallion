{{ config(materialized='table') }}

with imd_2025_long as (
    select lsoa21_code, 'imd' as measure, imd_score as score, imd_decile as decile, imd_rank as rank
    from {{ ref('stg_mhclg__imd_2025') }}
    union all
    select lsoa21_code, 'income', income_score, income_decile, null
    from {{ ref('stg_mhclg__imd_2025') }}
    union all
    select lsoa21_code, 'employment', employment_score, employment_decile, null
    from {{ ref('stg_mhclg__imd_2025') }}
    union all
    select lsoa21_code, 'education', education_score, education_decile, null
    from {{ ref('stg_mhclg__imd_2025') }}
    union all
    select lsoa21_code, 'health', health_score, health_decile, null
    from {{ ref('stg_mhclg__imd_2025') }}
    union all
    select lsoa21_code, 'crime', crime_score, crime_decile, null
    from {{ ref('stg_mhclg__imd_2025') }}
    union all
    select lsoa21_code, 'barriers', barriers_score, barriers_decile, null
    from {{ ref('stg_mhclg__imd_2025') }}
    union all
    select lsoa21_code, 'living_environment', living_environment_score,
        living_environment_decile, null
    from {{ ref('stg_mhclg__imd_2025') }}
),
all_imd as (
    select lsoa21_code, release, measure, score, decile, rank, mapping_method
    from {{ ref('int_mhclg__imd_2019_lsoa21') }}
    union all
    select lsoa21_code, 'iod2025', measure, score, decile, rank, 'direct'
    from imd_2025_long
)
select
    imd.lsoa21_code,
    imd.release,
    imd.measure,
    imd.score,
    imd.decile,
    imd.rank,
    imd.mapping_method,
    lsoa.borough_code
from all_imd as imd
inner join {{ ref('ons__london_lsoa21') }} as lsoa
    on imd.lsoa21_code = lsoa.lsoa21_code
