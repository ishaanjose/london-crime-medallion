with direct as (
    select
        crime.*,
        crime.lsoa_code as lsoa21_code,
        'police_uk' as lsoa21_method
    from {{ ref('police_uk__street_crimes') }} as crime
    where crime.lsoa_code in (
        select lsoa21_code from {{ ref('ons__london_lsoa21') }}
    )
),
fallback as (
    select
        crime.*,
        spatial.lsoa21_code as lsoa21_code,
        case when spatial.lsoa21_code is not null then 'spatial' end
            as lsoa21_method
    from {{ ref('police_uk__street_crimes') }} as crime
    left join {{ ref('ons__london_lsoa21') }} as spatial
        on ST_Contains(
            spatial.geometry,
            ST_Point(crime.longitude, crime.latitude)
        )
    where crime.lsoa_code is null
        or crime.lsoa_code not in (
            select lsoa21_code from {{ ref('ons__london_lsoa21') }}
        )
),
assigned as (
    select * from direct
    union all
    select * from fallback
)
select
    assigned.*,
    lsoa.borough_code,
    lsoa.borough_name
from assigned
left join {{ ref('ons__london_lsoa21') }} as lsoa
    on assigned.lsoa21_code = lsoa.lsoa21_code
