import { gradient } from '../lib/palette';

/**
 * Segmented daily-goal bar: `goal` segments, the first `done` filled in the
 * habit's color. The count label can exceed the goal (e.g. 4/3).
 */
export function BlockBar({ done, goal, rgb }: { done: number; goal: number; rgb: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {Array.from({ length: goal }).map((_, i) => (
          <span
            key={i}
            className="h-2 flex-1 rounded-full"
            style={i < done ? { backgroundImage: gradient(rgb, 1, 0.7) } : { backgroundColor: 'rgb(var(--ink-700))' }}
          />
        ))}
      </div>
      <span className={`text-xs tabular-nums ${done >= goal ? 'font-semibold' : 'text-slate-400'}`} style={done >= goal ? { color: `rgb(${rgb})` } : undefined}>
        {done}/{goal}
      </span>
    </div>
  );
}
