with spatial_matches as (
    select
        crime.*,
        spatial.lsoa21_code as spatial_lsoa21_code
    from {{ ref('police_uk__street_crimes') }} as crime
    left join {{ ref('ons__london_lsoa21') }} as spatial
        on ST_Contains(
            spatial.geometry,
            ST_Point(crime.longitude, crime.latitude)
        )
),
assigned as (
    select
        crimes.*,
        case
            when crimes.lsoa_code in (
                select lsoa21_code from {{ ref('ons__london_lsoa21') }}
            ) then crimes.lsoa_code
            else crimes.spatial_lsoa21_code
        end as lsoa21_code,
        case
            when crimes.lsoa_code in (
                select lsoa21_code from {{ ref('ons__london_lsoa21') }}
            ) then 'police_uk'
            when crimes.spatial_lsoa21_code is not null then 'spatial'
            else null
        end as lsoa21_method
    from spatial_matches as crimes
)
select
    assigned.* exclude (spatial_lsoa21_code),
    lsoa.borough_code,
    lsoa.borough_name
from assigned
left join {{ ref('ons__london_lsoa21') }} as lsoa
    on assigned.lsoa21_code = lsoa.lsoa21_code
