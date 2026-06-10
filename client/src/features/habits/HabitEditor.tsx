import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Stepper } from '../../components/Stepper';
import { useDeleteHabit, useGroups, useHabits, useSaveGroup, useSaveHabit } from '../../lib/hooks';
import { HabitIcon, HABIT_ICONS, HABIT_ICON_NAMES, DEFAULT_HABIT_ICON } from '../../lib/habitIcons';

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
  const [goal, setGoal] = useState(0); // daily goal in 10-min blocks

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setIcon(existing.emoji ?? DEFAULT_HABIT_ICON);
    setNote(existing.note ?? '');
    setGroupId(existing.groupId);
    setGoal(existing.dailyGoalMin ? Math.round(existing.dailyGoalMin / 10) : 0);
  }, [existing?.id]);

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
      durations: [10],
      defaultDurationMin: 10,
      dailyGoalMin: goal > 0 ? goal * 10 : null,
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

      <div className="card p-4">
        <Stepper label="Daily goal (10-min blocks, 0 = none)" value={goal} onChange={setGoal} min={0} max={12} />
        {goal > 0 && (
          <p className="mt-2 text-xs text-slate-400">
            {goal} block{goal === 1 ? '' : 's'} = {goal * 10} min/day
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button className="btn-accent flex-1" onClick={onSave} disabled={save.isPending}>Save</button>
        {existing && (
          <button className="btn-outline text-rose-400" onClick={() => { del.mutate(existing.id); navigate('/'); }}>Delete</button>
        )}
      </div>
    </div>
  );
}
