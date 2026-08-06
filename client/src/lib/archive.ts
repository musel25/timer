/** Shared "is this thing archived?" test for records carrying an `archivedAt`
 *  timestamp (notes, tasks). NULL/absent means it's still in the inbox.
 *
 *  Loose null check on purpose: a response predating the archive column — a
 *  stale server, or the service worker replaying a cached /api response — has
 *  no `archivedAt` at all, and `undefined` must read as "in the inbox".
 *  Otherwise every record hides itself and the inbox looks empty. */
export const isArchived = (record: { archivedAt?: number | null }): boolean =>
  record.archivedAt != null;
