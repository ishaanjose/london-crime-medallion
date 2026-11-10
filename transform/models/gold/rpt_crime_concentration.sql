-- Lorenz curve of crime across places, 100 points per year and place level
with ranked as (
    select
        year,
        place_level,
        crimes,
        row_number() over w_desc as place_rank,
        count(*) over w_all as n_places,
        sum(crimes) over (w_desc rows unbounded preceding) as cum_crimes,
        sum(crimes) over w_all as total_crimes
    from {{ ref('int_police_uk__place_year_crimes') }}
    window
        w_all as (partition by year, place_level),
        w_desc as (partition by year, place_level order by crimes desc, place_id)
)
select
    year,
    place_level,
    ceil(place_rank * 100.0 / n_places)::integer as pct_places,
    max(cum_crimes) * 100.0 / max(total_crimes) as pct_crime
from ranked
group by year, place_level, ceil(place_rank * 100.0 / n_places)::integer
