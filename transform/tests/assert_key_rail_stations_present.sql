-- National Rail-only stations that TfL's feed omits; a missing one means the NaPTAN union broke
select expected.station_key
from (values ('9100ORPNGTN'), ('9100BROMLYS'), ('9100HAYS')) as expected (station_key)
where expected.station_key not in (
    select station_key from {{ ref('transport__stations') }}
)
