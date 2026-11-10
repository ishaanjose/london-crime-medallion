select
    population.lsoa21_code,
    population.mid_year,
    population.mid_year_date,
    population.population,
    population.release,
    population.batch_id,
    population.source_file,
    london_lsoa.borough_code
from {{ ref('stg_nomis__lsoa21_population') }} as population
inner join {{ ref('ons__london_lsoa21') }} as london_lsoa
    on population.lsoa21_code = london_lsoa.lsoa21_code
