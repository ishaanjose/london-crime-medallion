{{ config(materialized='view') }}

select
    "LSOA code (2011)" as lsoa11_code,
    cast("Index of Multiple Deprivation (IMD) Score" as double) as imd_score,
    cast("Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)" as integer) as imd_rank,
    cast("Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)" as integer) as imd_decile,
    cast("Income Score (rate)" as double) as income_score,
    cast("Income Decile (where 1 is most deprived 10% of LSOAs)" as integer) as income_decile,
    cast("Employment Score (rate)" as double) as employment_score,
    cast("Employment Decile (where 1 is most deprived 10% of LSOAs)" as integer) as employment_decile,
    cast("Education, Skills and Training Score" as double) as education_score,
    cast("Education, Skills and Training Decile (where 1 is most deprived 10% of LSOAs)" as integer) as education_decile,
    cast("Health Deprivation and Disability Score" as double) as health_score,
    cast("Health Deprivation and Disability Decile (where 1 is most deprived 10% of LSOAs)" as integer) as health_decile,
    cast("Crime Score" as double) as crime_score,
    cast("Crime Decile (where 1 is most deprived 10% of LSOAs)" as integer) as crime_decile,
    cast("Barriers to Housing and Services Score" as double) as barriers_score,
    cast("Barriers to Housing and Services Decile (where 1 is most deprived 10% of LSOAs)" as integer) as barriers_decile,
    cast("Living Environment Score" as double) as living_environment_score,
    cast("Living Environment Decile (where 1 is most deprived 10% of LSOAs)" as integer) as living_environment_decile,
    cast("Total population: mid 2015 (excluding prisoners)" as integer) as population,
    'iod2019' as release,
    batch_id
from {{ source('mhclg_imd', 'imd_2019') }}
