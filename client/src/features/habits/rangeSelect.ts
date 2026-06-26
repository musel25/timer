export type RangeState = { pendingStart: string | null };
export const INITIAL_RANGE: RangeState = { pendingStart: null };

/**
 * Drives tap-to-paint range selection on the habit Month calendar.
 * - No pending start: tapping an unmarked day begins a range; tapping a marked day clears it.
 * - Pending start set: tapping any other day commits the inclusive range; tapping the same day cancels.
 */
export function tapDay(state: RangeState, day: string, isMarked: boolean):
  { state: RangeState; commit: { start: string; end: string } | null; clearDay: string | null } {
  if (state.pendingStart === null) {
    if (isMarked) return { state, commit: null, clearDay: day };          // clear a single marked day
    return { state: { pendingStart: day }, commit: null, clearDay: null }; // begin a range
  }
  if (state.pendingStart === day) return { state: INITIAL_RANGE, commit: null, clearDay: null }; // cancel
  const [start, end] = [state.pendingStart, day].sort();
  return { state: INITIAL_RANGE, commit: { start, end }, clearDay: null };
}
