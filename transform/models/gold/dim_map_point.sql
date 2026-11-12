-- police.uk snaps every crime to a fixed anonymised map point ("On or near ..."),
-- so the honest map unit is the point, not the crime
{%- set picked = ['location', 'lsoa21_code', 'borough_code'] %}
with crimes as (
    select longitude, latitude, location, lsoa21_code, borough_code
    from {{ ref('int_police_uk__street_dedup_source') }}
    where lsoa21_code is not null
        and longitude is not null
),
points as (
    select longitude, latitude, count(*) as total_crimes
    from crimes
    group by longitude, latitude
),
{%- for col in picked %}
-- almost always a single value per point; take the most frequent, and on a tie the
-- alphabetically first, so the label is the same every build (mode() picks arbitrarily)
{{ col }}_pick as (
    select longitude, latitude, {{ col }}
    from crimes
    where {{ col }} is not null
    group by longitude, latitude, {{ col }}
    qualify row_number() over (
        partition by longitude, latitude order by count(*) desc, {{ col }}
    ) = 1
){{ ',' if not loop.last }}
{%- endfor %}
select
    -- small integer keeps the web export compact; stable only within one build,
    -- which is fine because this dim and fct_police_uk_point_month always rebuild together
    dense_rank() over (order by longitude, latitude) as point_id,
    points.longitude,
    points.latitude,
    {%- for col in picked %}
    {{ col }}_pick.{{ col }},
    {%- endfor %}
    points.total_crimes
from points
{%- for col in picked %}
left join {{ col }}_pick using (longitude, latitude)
{%- endfor %}
