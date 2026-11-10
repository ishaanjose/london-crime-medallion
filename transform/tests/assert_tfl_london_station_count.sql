select count(*) filter (where is_in_london) as london_station_count
from {{ ref('tfl__stations') }}
having london_station_count < 400
