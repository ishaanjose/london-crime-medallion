const LATEST_ARCHIVE_URL = "https://data.police.uk/data/archive/latest.zip";

export interface ArchiveInfo {
  md5: string;
  lastModified: Date;
  sizeBytes: number;
}

function requireHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) {
    throw new Error(`Header "${name}" not found`);
  }
  return value;
}

export async function getLatestArchiveInfo(): Promise<ArchiveInfo> {
  const response = await fetch(LATEST_ARCHIVE_URL, { method: "HEAD" });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch headers: ${response.status} ${response.statusText}`,
    );
  }

  const md5 = requireHeader(response.headers, "x-amz-meta-md5").toLowerCase();
  const lastModified = new Date(
    requireHeader(response.headers, "last-modified"),
  );
  if (Number.isNaN(lastModified.getTime())) {
    throw new Error('Header "last-modified" is not a valid date');
  }

  const sizeBytes = Number(requireHeader(response.headers, "content-length"));
  if (Number.isNaN(sizeBytes)) {
    throw new Error('Header "content-length" is not a valid number');
  }

  return { md5, lastModified, sizeBytes };
}
