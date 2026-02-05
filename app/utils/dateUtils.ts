/**
 * Returns today's date in YYYY-MM-DD format in the user's local timezone.
 * Use this for daily resets (e.g. daily stats, swipe counters) so the "day"
 * flips at local midnight, not UTC midnight.
 */
export function getLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
