-- point x month x crime group counts; coordinates and names live in dim_map_point
-- anti-social behaviour stays in as a crime group so the map can toggle it
select
    dim_map_point.point_id,
    crimes.month,
    crimes.crime_group,
    count(*) as crime_count
from {{ ref('int_police_uk__street_dedup_source') }} as crimes
inner join {{ ref('dim_map_point') }} as dim_map_point
    on crimes.longitude = dim_map_point.longitude
    and crimes.latitude = dim_map_point.latitude
where crimes.lsoa21_code is not null
    and crimes.longitude is not null
group by dim_map_point.point_id, crimes.month, crimes.crime_group
