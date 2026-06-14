import { gradient } from '../lib/palette';

/**
 * Daily-goal progress bar: a single track filled proportionally to
 * `done / goal` (both in minutes) in the habit's color. The label can exceed
 * the goal (e.g. 24/20m); the fill is capped at full width.
 */
export function GoalBar({ done, goal, rgb }: { done: number; goal: number; rgb: string }) {
  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0;
  const met = done >= goal - 1e-9;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'rgb(var(--ink-700))' }}>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundImage: gradient(rgb, 1, 0.7) }} />
      </div>
      <span className={`text-xs tabular-nums ${met ? 'font-semibold' : 'text-slate-400'}`} style={met ? { color: `rgb(${rgb})` } : undefined}>
        {Math.round(done)}/{goal}m
      </span>
    </div>
  );
}
