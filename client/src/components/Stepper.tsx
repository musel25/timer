import { Minus, Plus } from 'lucide-react';

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  editable = false,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  editable?: boolean;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const commit = (raw: string) => {
    const n = parseInt(raw, 10);
    onChange(Number.isNaN(n) ? min : clamp(n));
  };
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <span className="text-sm text-slate-300">{label}</span>}
      <div className="flex items-center gap-2">
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700/70 active:scale-95" onClick={() => onChange(clamp(value - step))}>
          <Minus size={16} />
        </button>
        {editable ? (
          <span className="flex min-w-[3.5rem] items-center justify-center gap-0.5">
            <input
              type="number"
              inputMode="numeric"
              value={value}
              min={min}
              max={max}
              onChange={(e) => commit(e.target.value)}
              className="w-12 bg-transparent text-center font-mono text-lg tabular-nums focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {suffix ? <span className="text-xs text-slate-400">{suffix}</span> : null}
          </span>
        ) : (
          <span className="min-w-[3.5rem] text-center font-mono text-lg tabular-nums">
            {value}
            {suffix ? <span className="ml-0.5 text-xs text-slate-400">{suffix}</span> : null}
          </span>
        )}
        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-700/70 active:scale-95" onClick={() => onChange(clamp(value + step))}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
