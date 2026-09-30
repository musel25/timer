import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

/** Common minute amounts, offered as one-tap chips under minute steppers. */
export const MINUTE_PRESETS = [5, 10, 15, 20, 30, 45, 60, 90];

/**
 * A number input with -/+ buttons. The number is always typeable (committed and
 * clamped on blur/Enter, so clearing the box to retype never snaps to `min`),
 * holding -/+ repeats and speeds up, and `presets` adds one-tap value chips.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  presets,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  presets?: number[];
  /** @deprecated the value is always typeable now. */
  editable?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const [draft, setDraft] = useState<string | null>(null);

  // Hold-to-repeat: the latest value lives in a ref so the timer never steps a stale one.
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => stop, []);

  const bump = (dir: 1 | -1) => {
    const next = clamp(valueRef.current + dir * step);
    if (next === valueRef.current) return;
    valueRef.current = next; // don't wait for the re-render before the next repeat
    onChange(next);
  };
  const start = (dir: 1 | -1) => {
    stop();
    bump(dir);
    let ticks = 0;
    const tick = () => {
      ticks += 1;
      bump(dir);
      // Speed up the longer it is held: 150ms → 70ms → 35ms between steps.
      timer.current = setTimeout(tick, ticks < 5 ? 150 : ticks < 20 ? 70 : 35);
    };
    timer.current = setTimeout(tick, 400);
  };

  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) onChange(clamp(n));
    setDraft(null);
  };

  const stepButton = (dir: 1 | -1) => (
    <button
      type="button"
      aria-label={dir > 0 ? `Increase ${label ?? ''}`.trim() : `Decrease ${label ?? ''}`.trim()}
      className="flex h-9 w-9 touch-none select-none items-center justify-center rounded-lg bg-ink-700/70 active:scale-95"
      onPointerDown={(e) => { e.preventDefault(); start(dir); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bump(dir); } }}
    >
      {dir > 0 ? <Plus size={16} /> : <Minus size={16} />}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        {label && <span className="text-sm text-slate-300">{label}</span>}
        <div className="flex items-center gap-2">
          {stepButton(-1)}
          <span className="flex min-w-[3.5rem] items-center justify-center gap-0.5">
            <input
              type="number"
              inputMode="numeric"
              aria-label={label}
              value={draft ?? value}
              min={min}
              max={max}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="w-14 bg-transparent text-center font-mono text-lg tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {suffix ? <span className="text-xs text-slate-400">{suffix}</span> : null}
          </span>
          {stepButton(1)}
        </div>
      </div>
      {presets && (
        <div className="flex flex-wrap justify-end gap-1.5">
          {presets.filter((p) => p >= min && p <= max).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              aria-pressed={value === p}
              className={`chip px-2.5 py-1 text-xs ${value === p ? 'chip-active' : ''}`}
            >
              {p}{suffix === 'min' ? 'm' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
