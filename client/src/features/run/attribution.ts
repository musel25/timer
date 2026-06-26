/** Which habit a run's logged session counts toward: the live tag wins, else the spec's own habit. */
export function attributedHabitId(taggedHabitId: string | null, specHabitId?: string | null): string | null {
  return taggedHabitId ?? specHabitId ?? null;
}
