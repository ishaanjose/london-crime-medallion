import { withRetry } from "../retry.js";

export const IMD_RELEASES = [
  {
    release: "iod2019",
    url: "https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/845345/File_7_-_All_IoD2019_Scores__Ranks__Deciles_and_Population_Denominators_3.csv",
  },
  {
    release: "iod2025",
    url: "https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv",
  },
] as const;

export interface ImdFileInfo {
  etag: string;
  lastModified: Date;
  size: number;
}

function requireHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) {
    throw new Error(`Header "${name}" not found`);
  }
  return value;
}

export async function getImdFileInfo(url: string): Promise<ImdFileInfo> {
  const response = await withRetry(async () => {
    const response = await fetch(url, { method: "HEAD" });
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
