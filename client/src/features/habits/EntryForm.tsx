import { useMemo, useState } from 'react';
import { Check, Lightbulb, X } from 'lucide-react';
import type { EntryData, Habit } from '../../lib/types';
import { templateFor, type Field, type Template } from './templates';
import { cadenceLabel } from '../../lib/cadence';
import { categoryColor, gradient, solid, tint } from '../../lib/palette';
import { HabitIcon } from '../../lib/habitIcons';

/** What a completed entry carries back: the minutes it counts for, the note
 *  (plain composer only) and the template's answers. */
export interface EntrySubmission {
  minutes: number;
  note: string | null;
  entry: EntryData | null;
}

const initialValues = (t: Template | null, defaultMin: number, seed: EntryData): EntryData => {
  if (!t) return {};
  const out: EntryData = {};
  for (const f of t.fields) {
    if (f.type === 'minutes') out[f.id] = defaultMin;
    else if (f.type === 'scale') out[f.id] = Math.round(((f.min ?? 0) + (f.max ?? 10)) / 2);
    else out[f.id] = seed[f.id] ?? '';
  }
  return out;
};

/**
 * The composer a habit opens when you log it. With a template it renders that
 * template's fields; without one it falls back to minutes + an optional note,
 * which is what every habit did before templates existed.
 *
 * `seed` prefills carry-over answers (the book you are still reading). `onDone`
 * receives the minutes to record and the structured answers; `defaultMinutes`
 * is the habit's usual amount, and a 'check' habit records zero minutes.
 */
export function EntryForm({
  habit,
  defaultMinutes,
  seed = {},
  now = Date.now(),
  onDone,
  onCancel,
}: {
  habit: Habit;
  defaultMinutes: number;
  seed?: EntryData;
  now?: number;
  onDone: (s: EntrySubmission) => void;
  onCancel: () => void;
}) {
  const template = useMemo(() => templateFor(habit.template, now), [habit.template, now]);
  const timed = habit.kind === 'time';
  const [values, setValues] = useState<EntryData>(() => initialValues(template, defaultMinutes, seed));
  const [minutes, setMinutes] = useState(timed ? defaultMinutes : 0);
  const [note, setNote] = useState('');
  const [showIdeas, setShowIdeas] = useState(false);
  const color = categoryColor(habit.id);
  const cadence = cadenceLabel(habit);

  const set = (id: string, v: string | number) => setValues((prev) => ({ ...prev, [id]: v }));

  const missing = (template?.fields ?? []).filter((f) => f.required && !String(values[f.id] ?? '').trim());
  const canSubmit = missing.length === 0;

  function submit() {
    if (!canSubmit) return;
    if (!template) {
      onDone({ minutes: timed ? minutes : 0, note: note.trim() || null, entry: null });
      return;
    }
    const minuteField = template.fields.find((f) => f.type === 'minutes');
    const recorded = minuteField ? Number(values[minuteField.id]) || 0 : timed ? minutes : 0;
    // Drop blank answers so an entry only stores what was actually written.
    const entry: EntryData = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'number' || v.trim()) entry[k] = typeof v === 'string' ? v.trim() : v;
    }
    onDone({ minutes: recorded, note: null, entry });
  }

  const field = (f: Field) => {
    const v = values[f.id] ?? '';
    if (f.type === 'minutes') {
      return (
        <div key={f.id} className="flex items-center gap-2">
          <input
            type="number" min={0} inputMode="numeric" value={v}
            onChange={(e) => set(f.id, Number(e.target.value))}
            aria-label={f.label} className="input w-20 py-1.5 text-center text-sm"
          />
          <span className="text-xs text-slate-400">min</span>
        </div>
      );
    }
    if (f.type === 'scale') {
      const min = f.min ?? 0;
      const max = f.max ?? 10;
      const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div key={f.id}>
          <div className="label mb-1">{f.label}</div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={f.label}>
            {steps.map((n) => (
              <button
                key={n} type="button" onClick={() => set(f.id, n)} aria-pressed={v === n}
                className="chip h-8 w-8 justify-center p-0 text-xs font-medium"
                style={v === n
                  ? { borderColor: solid(color.rgb), backgroundImage: gradient(color.rgb, 0.9, 0.6), color: '#fff' }
                  : { borderColor: tint(color.rgb, 0.35), color: solid(color.rgb) }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (f.type === 'choice') {
      return (
        <div key={f.id}>
          <div className="label mb-1">{f.label}{f.required && ' *'}</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={f.label}>
            {(f.options ?? []).map((o) => (
              <button
                key={o} type="button" onClick={() => set(f.id, values[f.id] === o ? '' : o)} aria-pressed={v === o}
                className="chip px-2.5 py-1 text-xs"
                style={v === o
                  ? { borderColor: solid(color.rgb), backgroundImage: gradient(color.rgb, 0.9, 0.6), color: '#fff' }
                  : { borderColor: tint(color.rgb, 0.35), color: solid(color.rgb) }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (f.type === 'line') {
      return (
        <label key={f.id} className="block">
          <span className="label mb-1 block">{f.label}{f.required && ' *'}</span>
          <input
            type="text" value={String(v)} placeholder={f.placeholder}
            onChange={(e) => set(f.id, e.target.value)} className="input w-full py-1.5 text-sm"
          />
        </label>
      );
    }
    return (
      <label key={f.id} className="block">
        <span className="label mb-1 block">{f.label}{f.required && ' *'}</span>
        <textarea
          value={String(v)} placeholder={f.placeholder} rows={f.id === 'text' ? 6 : 2}
          onChange={(e) => set(f.id, e.target.value)} className="input w-full resize-y py-1.5 text-sm"
        />
      </label>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundImage: gradient(color.rgb) }}
        >
          <HabitIcon name={habit.emoji} size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{template?.title ?? habit.name}</div>
          {/* A weekly or monthly habit is otherwise only told its day by the
              agenda; here is where you are actually about to log it. */}
          {cadence && <div className="truncate text-xs text-slate-500">{cadence}</div>}
        </div>
        <button onClick={onCancel} aria-label="Cancel" className="shrink-0 text-slate-500 transition hover:text-slate-200">
          <X size={16} />
        </button>
      </div>

      {template?.prompt && (
        <div className="rounded-xl border border-ink-600/60 bg-ink-900/40 p-3">
          <div className="text-sm font-medium" style={{ color: solid(color.rgb) }}>{template.prompt.theme}</div>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-400">
            {template.prompt.questions.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </div>
      )}

      {template?.ideas && (
        <div>
          <button
            type="button" onClick={() => setShowIdeas((v) => !v)} aria-expanded={showIdeas}
            className="label flex items-center gap-1.5 text-slate-400 transition hover:text-slate-200"
          >
            <Lightbulb size={13} /> Need an idea?
          </button>
          {showIdeas && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {template.ideas.map((g) => (
                <div key={g.heading}>
                  <div className="label mb-1">{g.heading}</div>
                  <ul className="space-y-0.5 text-xs text-slate-400">
                    {g.items.map((i) => <li key={i}>· {i}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {template ? template.fields.map(field) : (
        <div className="space-y-2">
          {timed && (
            <div className="flex items-center gap-2">
              <input
                type="number" min={1} inputMode="numeric" value={minutes} autoFocus
                onChange={(e) => setMinutes(Number(e.target.value))}
                aria-label="Minutes" className="input w-20 py-1.5 text-center text-sm"
              />
              <span className="text-xs text-slate-400">min</span>
            </div>
          )}
          <label className="block">
            <span className="label mb-1 block">Note</span>
            <textarea
              value={note} rows={2} placeholder="Optional"
              onChange={(e) => setNote(e.target.value)} className="input w-full resize-y py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="chip w-full justify-center gap-1.5 py-2 font-medium disabled:opacity-40"
        style={{ borderColor: tint(color.rgb, 0.6), backgroundColor: tint(color.rgb, 0.18), color: solid(color.rgb) }}
      >
        <Check size={14} /> {canSubmit ? 'Log it' : `${missing[0]?.label} is required`}
      </button>
    </div>
  );
}
