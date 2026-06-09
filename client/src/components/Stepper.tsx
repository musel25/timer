export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center justify-between gap-3">
      {label && <span className="text-sm text-slate-300">{label}</span>}
      <div className="flex items-center gap-2">
        <button type="button" className="h-9 w-9 rounded-lg bg-ink-700/70 text-lg active:scale-95" onClick={() => onChange(clamp(value - step))}>
          −
        </button>
        <span className="min-w-[3.5rem] text-center font-mono text-lg tabular-nums">
          {value}
          {suffix ? <span className="ml-0.5 text-xs text-slate-400">{suffix}</span> : null}
        </span>
        <button type="button" className="h-9 w-9 rounded-lg bg-ink-700/70 text-lg active:scale-95" onClick={() => onChange(clamp(value + step))}>
          ＋
        </button>
      </div>
    </div>
  );
}
