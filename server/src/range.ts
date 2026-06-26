export const MAX_RANGE_DAYS = 366;

/** Inclusive list of 'YYYY-MM-DD' local keys from start to end. */
export function datesInclusive(start: string, end: string): string[] {
  // Parse as UTC noon to avoid DST edge shifts on the date arithmetic.
  const s = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new Error('invalid_date');
  if (s.getTime() > e.getTime()) throw new Error('start_after_end');
  const out: string[] = [];
  for (let d = s; d.getTime() <= e.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > MAX_RANGE_DAYS) throw new Error('range_too_long');
  }
  return out;
}
