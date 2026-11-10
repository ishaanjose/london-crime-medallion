select
    lsoa21_code,
    max(decile) filter (where measure = 'imd' and release = 'iod2019') as imd_decile_2019,
    max(decile) filter (where measure = 'imd' and release = 'iod2025') as imd_decile_2025,
    max(decile) filter (where measure = 'income' and release = 'iod2019') as income_decile_2019,
    max(decile) filter (where measure = 'income' and release = 'iod2025') as income_decile_2025,
    max(decile) filter (
        where measure = 'employment' and release = 'iod2019'
    ) as employment_decile_2019,
    max(decile) filter (
        where measure = 'employment' and release = 'iod2025'
    ) as employment_decile_2025,
    max(rank) filter (where measure = 'imd' and release = 'iod2025') as imd_rank_2025,
    max(mapping_method) filter (where release = 'iod2019') as imd_2019_mapping_method
from {{ ref('mhclg__imd_lsoa21') }}
group by lsoa21_code
