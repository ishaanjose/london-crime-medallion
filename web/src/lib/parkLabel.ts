// Label for the nearest park: its OS name, else its OS function in sentence case
// ("Playing Field" -> "Playing field"), since ~36% of kept sites are unnamed in the source.
export function parkLabel(
  name: string | null | undefined,
  func: string | null | undefined,
): string | null {
  if (name) return name;
  if (func) return func.charAt(0).toUpperCase() + func.slice(1).toLowerCase();
  return null;
}
