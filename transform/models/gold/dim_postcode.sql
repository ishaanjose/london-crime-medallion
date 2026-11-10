select postcode, postcode_key, lsoa21_code, borough_code, latitude, longitude, is_live
from {{ ref('ons__london_postcodes') }}
