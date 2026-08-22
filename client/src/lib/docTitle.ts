/**
 * Single owner of `document.title`.
 *
 * More than one feature wants to badge the tab (the Now board's ready threads,
 * the agents dashboard's waiting sessions). When each wrote the title directly
 * they clobbered each other: whichever re-rendered last won, so the Now badge
 * vanished on every agents poll. Contributors register a count under a key
 * instead, and the badge shows the total.
 */
const BASE_TITLE = 'Timer';

const counts = new Map<string, number>();

export function setTitleCount(key: string, n: number): void {
  if (n > 0) counts.set(key, n);
  else counts.delete(key);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  document.title = total > 0 ? `(${total}) ${BASE_TITLE}` : BASE_TITLE;
}

/** Drop a contributor entirely (on unmount). */
export const clearTitleCount = (key: string): void => setTitleCount(key, 0);
