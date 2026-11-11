-- fails if any London × month × crime_group pair has abs(police_uk - met) / met > 50%
-- without a matching known_crime_gaps row covering that month
with london_totals as (
    select
        month,
        crime_group,
        sum(police_uk_count) as police_uk,
        sum(met_count)       as met
    from {{ ref('rpt_crime_reconciliation') }}
    group by 1, 2
),
large_gaps as (
    select
        month,
        crime_group,
        police_uk,
        met
    from london_totals
    where met > 0
      and abs(police_uk - met)::float / met > 0.5
),
unregistered as (
    select
        g.month,
        g.crime_group,
        g.police_uk,
        g.met
    from large_gaps as g
    left join {{ ref('known_crime_gaps') }} as k
        on g.crime_group = k.crime_group
        and g.month >= k.start_month::date
        and g.month <= coalesce(k.end_month::date, '9999-12-01'::date)
    where k.crime_group is null
)
select * from unregistered
