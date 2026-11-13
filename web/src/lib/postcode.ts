import type { ExportIndex } from "@/lib/data";
import { parquet, query } from "@/lib/query";

export const INVALID_POSTCODE_MESSAGE = "That doesn’t look like a UK postcode. Check it and try again.";

// postcode_lsoa holds live London postcodes only, so a postcode outside London
// and a terminated one look the same here; one message covers both.
export const POSTCODE_NOT_FOUND_MESSAGE =
  "We couldn’t find that postcode in London. It may be outside London or no longer in use.";

// Outward code (e.g. SW1A, N1, E14) then inward code (digit + two letters).
const POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/;

export type PostcodeLookup =
  | { status: "found"; postcode: string; lsoa21Code: string; latitude: number; longitude: number }
  | { status: "invalid"; message: string }
  | { status: "not_found"; postcode: string; message: string };

// Matches the export's key: uppercase, no spaces.
export function normalisePostcode(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function isValidPostcode(key: string): boolean {
  return POSTCODE_RE.test(key);
}

export async function lookupPostcode(index: ExportIndex, input: string): Promise<PostcodeLookup> {
  const key = normalisePostcode(input);
  if (!isValidPostcode(key)) {
    return { status: "invalid", message: INVALID_POSTCODE_MESSAGE };
  }
  // key is safe to inline: the regex allows only A-Z and 0-9
  const rows = await query<{ lsoa21_code: string; latitude: number; longitude: number }>(
    `select lsoa21_code, latitude, longitude from ${parquet(index, "postcode_lsoa")} where postcode = '${key}'`,
  );
  if (rows.length === 0) {
    return { status: "not_found", postcode: key, message: POSTCODE_NOT_FOUND_MESSAGE };
  }
  const { lsoa21_code, latitude, longitude } = rows[0];
  return { status: "found", postcode: key, lsoa21Code: lsoa21_code, latitude, longitude };
}
