const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

export function formatMonth(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m] = value.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
