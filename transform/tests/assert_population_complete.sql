with expected as (
    select count(*) as lsoa_count
    from {{ ref('ons__london_lsoa21') }}
),
actual as (
    select
        mid_year,
        count(*) as lsoa_count
    from {{ ref('nomis__lsoa21_population') }}
    group by mid_year
)
select
    actual.mid_year,
    actual.lsoa_count,
    expected.lsoa_count as expected_lsoa_count
from actual
cross join expected
where actual.lsoa_count < expected.lsoa_count
