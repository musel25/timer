import type { PresetType } from './types';

/** Human label for a saved-timer type. Shared by the timer cards and the editor's type toggle. */
export function timerTypeLabel(type: PresetType): string {
  switch (type) {
    case 'pomodoro':
      return 'Focus block';
    case 'interval':
      return 'Interval';
    case 'simple':
      return 'Timer';
  }
}
