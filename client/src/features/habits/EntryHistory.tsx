import type { Habit, Session } from '../../lib/types';
import { entriesFor, seriesFor } from './entries';
import { templateFor } from './templates';
import { LIFE_AREAS } from './templates';
import { categoryColor } from '../../lib/palette';

/** Two numeric series drawn against each other on one small chart. */
function PairChart({
  a, b, labelA, labelB, min, max, rgb,
}: {
  a: { at: number; value: number }[];
  b: { at: number; value: number }[];
  labelA: string;
  labelB: string;
  min: number;
  max: number;
  rgb: string;
}) {
  const n = Math.max(a.length, b.length);
  if (n < 2) return null;
  const W = 320;
  const H = 96;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - ((v - min) / (max - min)) * H;
  const path = (s: { value: number }[]) => s.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label={`${labelA} versus ${labelB}`}>
        <path d={path(a)} fill="none" stroke={`rgb(${rgb})`} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={path(b)} fill="none" stroke={`rgb(${rgb} / 0.45)`} strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: `rgb(${rgb})` }} /> {labelA}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: `rgb(${rgb} / 0.45)` }} /> {labelB}
        </span>
      </div>
    </div>
  );
}

/** One area's rating over time, as a sparkline small enough to tile nine of. */
function Sparkline({ points, min, max, rgb, label }: {
  points: { at: number; value: number }[];
  min: number;
  max: number;
  rgb: string;
  label: string;
}) {
  const W = 80;
  const H = 24;
  const last = points[points.length - 1]?.value;
  const d = points.length > 1
    ? points.map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * W).toFixed(1)},${(H - ((p.value - min) / (max - min)) * H).toFixed(1)}`).join(' ')
    : '';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="truncate text-xs text-slate-300">{label}</span>
        <span className="text-xs font-medium" style={{ color: `rgb(${rgb})` }}>{last ?? '—'}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-full" preserveAspectRatio="none" aria-hidden="true">
        {d
          ? <path d={d} fill="none" stroke={`rgb(${rgb})`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          : <line x1={0} y1={H} x2={W} y2={H} stroke="rgb(var(--ink-700))" strokeWidth={1} />}
      </svg>
    </div>
  );
}

/**
 * The reflective payoff of a structured habit: the charts its numbers make
 * possible, then every past entry as a readable timeline.
 *
 * Courage gets anticipated vs actual discomfort on one chart, because the gap
 * between the two lines *is* the insight — anticipation is usually worse than
 * the thing. The life review gets its nine areas as small multiples, which is
 * the only way a month-by-month rating becomes a trend you can see.
 */
export function EntryHistory({ habit, sessions }: { habit: Habit; sessions: Session[] }) {
  const entries = entriesFor(sessions, habit.id);
  if (entries.length === 0) return null;

  const color = categoryColor(habit.id);
  const template = templateFor(habit.template);
  const fieldLabel = (id: string) =>
    id.startsWith('rate:') ? id.slice(5) : template?.fields.find((f) => f.id === id)?.label ?? id;

  const anticipated = seriesFor(sessions, habit.id, 'anticipated');
  const actual = seriesFor(sessions, habit.id, 'actual');
  const showGap = habit.template === 'courage' && anticipated.length > 1 && actual.length > 1;
  const showAreas = habit.template === 'life-review';

  const avgGap = showGap
    ? anticipated.reduce((sum, p, i) => sum + (p.value - (actual[i]?.value ?? p.value)), 0) / anticipated.length
    : 0;

  return (
    <div className="space-y-5">
      {showGap && (
        <section className="card p-4">
          <h2 className="label mb-1">Anticipated vs actual</h2>
          <p className="mb-3 text-xs text-slate-400">
            {avgGap > 0.2
              ? `On average you expected it ${avgGap.toFixed(1)} points worse than it was.`
              : avgGap < -0.2
                ? `On average it was ${Math.abs(avgGap).toFixed(1)} points harder than you expected.`
                : 'So far, roughly as hard as you expected.'}
          </p>
          <PairChart a={anticipated} b={actual} labelA="Anticipated" labelB="Actual" min={1} max={5} rgb={color.rgb} />
        </section>
      )}

      {showAreas && (
        <section className="card p-4">
          <h2 className="label mb-3">Areas over time</h2>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {LIFE_AREAS.map((area) => (
              <Sparkline
                key={area}
                label={area}
                points={seriesFor(sessions, habit.id, `rate:${area}`)}
                min={0}
                max={10}
                rgb={color.rgb}
              />
            ))}
          </div>
        </section>
      )}

      <section className="card p-4">
        <h2 className="label mb-3">Entries</h2>
        <div className="divide-y divide-ink-600">
          {entries.slice(0, 24).map((e) => (
            <article key={e.id} className="py-3 first:pt-0 last:pb-0">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <time className="text-xs text-slate-400">
                  {new Date(e.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </time>
                {e.minutes > 0 && <span className="text-xs text-slate-500">{e.minutes} min</span>}
              </div>
              <dl className="space-y-1">
                {Object.entries(e.data)
                  .filter(([k]) => k !== 'minutes')
                  .map(([k, v]) => (
                    <div key={k} className="text-sm">
                      <dt className="text-xs text-slate-500">{fieldLabel(k)}</dt>
                      <dd className="whitespace-pre-wrap text-slate-300">{String(v)}</dd>
                    </div>
                  ))}
              </dl>
            </article>
          ))}
        </div>
        {entries.length > 24 && (
          <p className="mt-3 text-xs text-slate-500">Showing the 24 most recent of {entries.length}.</p>
        )}
      </section>
    </div>
  );
}
