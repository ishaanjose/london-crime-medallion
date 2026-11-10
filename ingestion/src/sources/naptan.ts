import { withRetry } from "../retry.js";

const NAPTAN_RAIL_URL =
  "https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv&atcoAreaCodes=910";

// GB has about 2,700 rail stations, make sure not trunacted
const MIN_RAIL_STATIONS = 2000;

export async function fetchRailStations(): Promise<{ text: string; rows: number }> {
  return withRetry(async () => {
    const response = await fetch(NAPTAN_RAIL_URL);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch NaPTAN rail stations: ${response.status} ${response.statusText}`,
      );
    }

    const text = await response.text();
    const rows = text.split(/\r?\n/).filter((line) => line.trim() !== "").length - 1;
    if (rows < MIN_RAIL_STATIONS) {
      throw new Error(
        `NaPTAN rail stations response has ${rows} rows, expected at least ${MIN_RAIL_STATIONS}`,
      );
    }

    return { text, rows };
  });
}
