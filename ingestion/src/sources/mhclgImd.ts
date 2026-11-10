import { withRetry } from "../retry.js";

export const IMD_2025_FILE7_URL =
  "https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv";

function requireHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) {
    throw new Error(`Header "${name}" not found`);
  }
  return value;
}

export async function getImdFileInfo(): Promise<{
  etag: string;
  lastModified: Date;
  size: number;
}> {
  const response = await withRetry(async () => {
    const response = await fetch(IMD_2025_FILE7_URL, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch IMD file headers: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  });

  const etag = requireHeader(response.headers, "etag").replaceAll('"', "");
  const lastModified = new Date(
    requireHeader(response.headers, "last-modified"),
  );
  if (Number.isNaN(lastModified.getTime())) {
    throw new Error('Header "last-modified" is not a valid date');
  }

  const size = Number(requireHeader(response.headers, "content-length"));
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Header "content-length" is not a positive number');
  }

  return { etag, lastModified, size };
}
