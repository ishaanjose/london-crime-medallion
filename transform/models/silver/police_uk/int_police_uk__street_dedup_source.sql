with numbered as (
    select
        crimes.*,
        duplicated.month as duplicated_month,
        row_number() over (
            partition by
                crimes.month,
                crimes.force,
                crimes.crime_type,
                crimes.longitude,
                crimes.latitude,
                crimes.location,
                crimes.lsoa21_code,
                crimes.context
            order by crimes.record_id
        ) as duplicate_row_number,
        count(*) over (
            partition by
                crimes.month,
                crimes.force,
                crimes.crime_type,
                crimes.longitude,
                crimes.latitude,
                crimes.location,
                crimes.lsoa21_code,
                crimes.context
        ) as duplicate_count
    from {{ ref('police_uk__street_crimes_lsoa21') }} as crimes
    left join {{ ref('duplicated_source_months') }} as duplicated
        on crimes.month = cast(duplicated.month as date)
        and crimes.force = duplicated.force
        and crimes.crime_type = duplicated.crime_type
)
select * exclude (duplicated_month, duplicate_row_number, duplicate_count)
from numbered
where duplicated_month is null
   or duplicate_row_number <= ceil(duplicate_count / 2.0)
