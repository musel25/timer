import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useDeleteHabit, useGroups, useHabits, useSaveGroup, useSaveHabit } from '../../lib/hooks';
import { HabitIcon, HABIT_ICONS, HABIT_ICON_NAMES, DEFAULT_HABIT_ICON } from '../../lib/habitIcons';

const DURATION_CHOICES = [5, 10, 15, 20, 25, 30, 45, 60]; // minutes
const DEFAULT_DURATIONS = [5, 10, 20];

export function HabitEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: habits = [] } = useHabits();
  const { data: groups = [] } = useGroups();
  const save = useSaveHabit();
  const del = useDeleteHabit();
  const saveGroup = useSaveGroup();
  const existing = id ? habits.find((h) => h.id === id) : undefined;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_HABIT_ICON);
  const [note, setNote] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [kind, setKind] = useState<'time' | 'abstain'>('time');
  const [goal, setGoal] = useState(20); // daily goal in minutes (0 = none)
  const [durations, setDurations] = useState<number[]>(DEFAULT_DURATIONS);
  const [defaultMin, setDefaultMin] = useState(10);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setIcon(existing.emoji ?? DEFAULT_HABIT_ICON);
    setNote(existing.note ?? '');
    setGroupId(existing.groupId);
    setKind(existing.kind ?? 'time');
    setGoal(existing.dailyGoalMin ?? 0);
    const dur = existing.durations?.length ? existing.durations : [10];
    setDurations(dur);
    setDefaultMin(existing.defaultDurationMin && dur.includes(existing.defaultDurationMin) ? existing.defaultDurationMin : dur[0]);
  }, [existing?.id]);

  function toggleDuration(min: number) {
    setDurations((cur) => {
      if (cur.includes(min)) {
        if (cur.length === 1) return cur; // keep at least one
        const next = cur.filter((m) => m !== min);
        if (defaultMin === min) setDefaultMin(next[0]);
        return next;
      }
      return [...cur, min].sort((a, b) => a - b);
    });
  }

  async function newGroup() {
    const name = window.prompt('New group name (e.g. Morning)');
    if (!name) return;
    const g = await saveGroup.mutateAsync({ name, emoji: 'pin', sortOrder: groups.length });
    setGroupId(g.id);
  }

  async function onSave() {
    if (!name.trim()) return;
    await save.mutateAsync({
      id,
      name: name.trim(),
      emoji: icon,
      note: note.trim() || null,
      groupId,
      kind,
      durations,
      defaultDurationMin: kind === 'abstain' ? null : defaultMin,
      dailyGoalMin: kind === 'time' && goal > 0 ? goal : null,
      timerType: 'simple',
    });
    navigate('/');
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="pt-1 text-2xl font-bold">{existing ? 'Edit habit' : 'New habit'}</h1>

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <HabitIcon name={icon} size={24} />
        </div>
        <input className="input flex-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {HABIT_ICON_NAMES.map((n) => {
          const Icon = HABIT_ICONS[n];
          return (
            <button
              key={n}
              onClick={() => setIcon(n)}
              className={`rounded-lg p-2 transition ${icon === n ? 'bg-accent text-white' : 'bg-ink-700/50 text-slate-300 hover:bg-ink-600/60'}`}
              title={n}
            >
              <Icon size={18} strokeWidth={2} />
            </button>
          );
        })}
      </div>

      <input className="input" placeholder="Note (e.g. in French)" value={note} onChange={(e) => setNote(e.target.value)} />

      <div>
        <label className="label">Type</label>
        <div className="mt-1 flex gap-1.5">
          <button
            onClick={() => setKind('time')}
            className={`chip flex-1 justify-center px-3 py-1.5 ${kind === 'time' ? 'chip-active' : ''}`}
          >
            Focus time
          </button>
          <button
            onClick={() => setKind('abstain')}
            className={`chip flex-1 justify-center px-3 py-1.5 ${kind === 'abstain' ? 'chip-active' : ''}`}
          >
            Avoid (daily check)
          </button>
        </div>
        {kind === 'abstain' && (
          <p className="mt-1.5 text-xs text-slate-400">No timer — mark "stayed off it" at the end of each day to build a clean streak.</p>
        )}
      </div>

      <div>
        <label className="label">Group</label>
        <div className="mt-1 flex gap-2">
          <select className="input flex-1" value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value || null)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button className="btn-outline px-3" onClick={newGroup}><Plus size={16} /></button>
        </div>
      </div>

      {kind === 'time' && (
      <div className="card space-y-3 p-4">
        <div>
          <label className="label">Timer lengths</label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DURATION_CHOICES.map((min) => (
              <button
                key={min}
                onClick={() => toggleDuration(min)}
                className={`chip px-3 py-1.5 ${durations.includes(min) ? 'chip-active' : ''}`}
              >
                {min}m
              </button>
            ))}
          </div>
        </div>
        {durations.length > 1 && (
          <div>
            <label className="label">Default</label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {durations.map((min) => (
                <button
                  key={min}
                  onClick={() => setDefaultMin(min)}
                  className={`chip px-3 py-1.5 ${defaultMin === min ? 'chip-active' : ''}`}
                >
                  {min}m
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {kind === 'time' && (
      <div className="card p-4">
        <Stepper label="Daily goal" value={goal} onChange={setGoal} min={0} max={120} step={5} suffix="min" />
        {goal > 0 ? (
          <p className="mt-2 text-xs text-slate-400">{goal} min/day</p>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No daily goal</p>
        )}
      </div>
      )}

      <div className="flex gap-3">
        <button className="btn-accent flex-1" onClick={onSave} disabled={save.isPending}>Save</button>
        {existing && (
          <button className="btn-outline text-rose-400" onClick={() => { del.mutate(existing.id); navigate('/'); }}>Delete</button>
        )}
      </div>
    </div>
  );
}
