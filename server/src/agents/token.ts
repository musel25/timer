/**
 * Validate the shared token sent by Claude Code hooks on the public ingest route.
 * When no token is configured (empty `expected`), ingest is open — convenient for a
 * purely-local dev setup where only localhost can reach the port anyway.
 */
export function tokenOk(provided: string | undefined, expected: string): boolean {
  if (!expected) return true;
  return provided === expected;
}
