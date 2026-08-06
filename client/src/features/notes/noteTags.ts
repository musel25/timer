/** #tag = '#' followed by letters (any language), digits, '_' or '-'. */
const TAG_RE = /#([\p{L}\p{N}_-]+)/gu;

/** Unique lowercased tags found in the text, in order of first appearance. */
/** Loose null check on purpose: a response predating the archive column (a stale
 *  server, or the service worker replaying a cached /api/notes) has no
 *  `archivedAt` at all, and `undefined` must read as "in the inbox" — otherwise
 *  every note hides itself and the inbox looks empty. */
export const isArchived = (note: { archivedAt?: number | null }): boolean =>
  note.archivedAt != null;

export function extractTags(text: string): string[] {
  return [...new Set([...text.matchAll(TAG_RE)].map((m) => m[1].toLowerCase()))];
}

/** Split text into plain/tag segments so the UI can highlight tags in place. */
export function splitByTags(text: string): { text: string; isTag: boolean }[] {
  const parts: { text: string; isTag: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i), isTag: false });
    parts.push({ text: m[0], isTag: true });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), isTag: false });
  return parts;
}
