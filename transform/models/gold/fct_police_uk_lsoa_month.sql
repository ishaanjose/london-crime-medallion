-- every LSOA in every month, zero-filled; rates exclude anti-social behaviour
-- generated rather than distinct, so a month missing from the data still appears as zeros
with months as (
    select unnest(generate_series(min(month), max(month), interval 1 month))::date as month
    from {{ ref('fct_police_uk_crimes_lsoa_month') }}
),
spine as (
    select
        dim_lsoa.lsoa21_code,
        dim_lsoa.borough_code,
        months.month
    from {{ ref('dim_lsoa') }} as dim_lsoa
    cross join months
),
counts as (
    select
        lsoa21_code,
        month,
        sum(crime_count) filter (where crime_group <> 'Anti-social behaviour') as crime_count,
        sum(crime_count) filter (where crime_group = 'Anti-social behaviour') as asb_count
    from {{ ref('fct_police_uk_crimes_lsoa_month') }}
    group by lsoa21_code, month
),
population as (
    select
        lsoa21_code,
        mid_year,
        population
    from {{ ref('nomis__lsoa21_population') }}
),
-- bounds come from the data, so a new mid-year release moves them automatically
population_years as (
    select
        min(mid_year) as first_year,
        max(mid_year) as last_year
    from population
),
joined as (
    select
        spine.lsoa21_code,
        spine.borough_code,
        spine.month,
        coalesce(counts.crime_count, 0) as crime_count,
        coalesce(counts.asb_count, 0) as asb_count,
        population.population,
        population.mid_year as population_year
    from spine
    cross join population_years
    left join counts
        on spine.lsoa21_code = counts.lsoa21_code
        and spine.month = counts.month
    left join population
        on spine.lsoa21_code = population.lsoa21_code
        and population.mid_year = greatest(
            population_years.first_year,
            least(population_years.last_year, year(spine.month))
        )
)
select
    lsoa21_code,
    borough_code,
    month,
    crime_count,
    asb_count,
    population,
    population_year,
    population_year <> year(month) as population_is_estimated_year,
    round(crime_count * 1000.0 / population, 3) as crimes_per_1000,
    -- LSOAs were designed for 1,000+ residents; below that, monthly rates are noisy
    population < 1000 as is_low_population
from joined
