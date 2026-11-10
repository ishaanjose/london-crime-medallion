select cast(release as varchar), cast(measure as varchar)
from {{ ref('mhclg__imd_lsoa21') }}
group by release, measure
having count(*) != (select count(*) from {{ ref('ons__london_lsoa21') }})
union all
select 'missing pairs', cast(count(*) as varchar)
from (select distinct release, measure from {{ ref('mhclg__imd_lsoa21') }})
having count(*) != 16
