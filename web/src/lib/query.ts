import { getDb } from "@/lib/duckdb";
import { dataUrl, type ExportIndex } from "@/lib/data";

export function parquet(index: ExportIndex, name: string): string {
  const path = `${name}.parquet`;
  const file = index.files.find((f) => f.path === path);
  if (!file) throw new Error(`${path} not found in export index`);
  return `read_parquet('${dataUrl(path)}')`;
}

function convertBigInt(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        convertBigInt(v),
      ]),
    );
  }
  return value;
}

export async function query<T>(sql: string): Promise<T[]> {
  const db = await getDb();
  const conn = await db.connect();
  try {
    const result = await conn.query(sql);
    return result.toArray().map((r) => convertBigInt(r.toJSON()) as T);
  } finally {
    await conn.close();
  }
}
