export type ExportColumn = { name: string; type: string };

export type ExportFile = {
  path: string;
  bytes: number;
  sha256: string;
  rows: number;
  columns: ExportColumn[];
};

export type ExportIndex = {
  built_at: string;
  git_commit: string;
  git_dirty: boolean;
  files: ExportFile[];
};

export function dataUrl(path: string): string {
  return new URL(
    `${process.env.NEXT_PUBLIC_DATA_BASE_URL}/${path}`,
    window.location.href,
  ).toString();
}

export async function loadIndex(): Promise<ExportIndex> {
  const res = await fetch(dataUrl("index.json"));
  if (!res.ok) {
    throw new Error(`index.json: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
