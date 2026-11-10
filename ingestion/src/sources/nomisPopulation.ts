export const NOMIS_POPULATION_BASE =
  "https://www.nomisweb.co.uk/api/v01/dataset/NM_2014_1";

export const NOMIS_PAGE_SIZE = 25000;

export function populationUrl(offset: number): string {
  const params = new URLSearchParams({
    date: "2011-2024",
    geography: "2013265927TYPE151",
    gender: "0",
    c_age: "200",
    measures: "20100",
    select: "DATE,GEOGRAPHY_CODE,GEOGRAPHY_NAME,OBS_VALUE",
    recordoffset: String(offset),
    recordlimit: String(NOMIS_PAGE_SIZE),
  });
  return `${NOMIS_POPULATION_BASE}.data.csv?${params}`;
}
