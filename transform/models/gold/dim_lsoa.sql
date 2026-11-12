-- one row per London LSOA; polygons are left out to keep the web export small
select
    lsoa.lsoa21_code,
    lsoa.lsoa21_name,
    lsoa.borough_code,
    lsoa.borough_name,
    ST_Area(
        ST_Transform(lsoa.geometry, 'EPSG:4326', 'EPSG:27700', always_xy := true)
    ) / 1e6 as area_km2,
    -- population-weighted point, for map labels and markers
    ST_Y(lsoa.pop_centroid) as centroid_lat,
    ST_X(lsoa.pop_centroid) as centroid_lon,

    imd.imd_decile_2019,
    imd.imd_decile_2025,
    imd.imd_rank_2025,
    imd.income_decile_2019,
    imd.income_decile_2025,
    imd.employment_decile_2019,
    imd.employment_decile_2025,
    imd.imd_2019_mapping_method,

    station.nearest_station_m,
    station.nearest_station_name,
    station.nearest_station_key,
    station.nearest_station_network,
    station.stations_within_1km,

    park.nearest_park_entrance_m,
    park.nearest_park_site_id,
    park.nearest_park_name,
    park.nearest_park_function,
    park.park_ha_within_1km
from {{ ref('ons__london_lsoa21') }} as lsoa
left join {{ ref('int_lsoa__imd_wide') }} as imd using (lsoa21_code)
left join {{ ref('int_lsoa__nearest_station') }} as station using (lsoa21_code)
left join {{ ref('int_lsoa__park_access') }} as park using (lsoa21_code)
