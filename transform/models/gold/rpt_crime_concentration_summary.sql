-- headline concentration numbers per year and place level
with half as (
    select
        year,
        place_level,
        min(pct_places) as pct_places_for_half_of_crime
    from {{ ref('rpt_crime_concentration') }}
    where pct_crime >= 50
    group by year, place_level
),
ranked as (
    select
        year,
        place_level,
        crimes,
        row_number() over (partition by year, place_level order by crimes) as rank_asc,
        count(*) over (partition by year, place_level) as n_places
    from {{ ref('int_police_uk__place_year_crimes') }}
),
gini as (
    select
        year,
        place_level,
        max(n_places) as n_places,
        sum(crimes) as total_crimes,
        sum((2 * rank_asc - n_places - 1) * crimes) * 1.0 / (max(n_places) * sum(crimes)) as gini
    from ranked
    group by year, place_level
)
select
    gini.year,
    gini.place_level,
    gini.n_places,
    gini.total_crimes,
    half.pct_places_for_half_of_crime,
    round(gini.gini, 4) as gini
from gini
inner join half
    on gini.year = half.year
    and gini.place_level = half.place_level
