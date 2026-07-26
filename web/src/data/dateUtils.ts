/** Local (not UTC) date key, e.g. "2026-07-22" — matches what the Header's visible clock shows. */
export function localDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isLocalToday(d: Date): boolean {
  return localDateKey(d) === localDateKey(new Date());
}
