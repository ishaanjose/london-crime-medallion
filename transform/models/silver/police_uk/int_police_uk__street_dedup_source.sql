with affected as (
    select crimes.*
    from {{ ref('police_uk__street_crimes_lsoa21') }} as crimes
    inner join {{ ref('duplicated_source_months') }} as duplicated
        on crimes.month = cast(duplicated.month as date)
        and crimes.force = duplicated.force
        and crimes.crime_type = duplicated.crime_type
    qualify row_number() over (
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
    ) <= ceil(
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
        ) / 2.0
    )
),
unaffected as (
    select crimes.*
    from {{ ref('police_uk__street_crimes_lsoa21') }} as crimes
    left join {{ ref('duplicated_source_months') }} as duplicated
        on crimes.month = cast(duplicated.month as date)
        and crimes.force = duplicated.force
        and crimes.crime_type = duplicated.crime_type
    where duplicated.month is null
)
select * from affected
union all
select * from unaffected
