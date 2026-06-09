import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Stepper } from '../../components/Stepper';
import { useDeleteHabit, useGroups, useHabits, useSaveGroup, useSaveHabit } from '../../lib/hooks';

const EMOJI = ['⚔️', '🧮', '🧠', '💻', '📖', '✍️', '🏃', '🧘', '🎸', '💪', '🥗', '🌙', '☀️', '⏱'];

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
  const [emoji, setEmoji] = useState('⏱');
  const [note, setNote] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [durations, setDurations] = useState<number[]>([5, 10, 15, 20]);
  const [defaultMin, setDefaultMin] = useState<number | null>(10);
  const [goal, setGoal] = useState(0);
  const [addVal, setAddVal] = useState(25);

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setEmoji(existing.emoji ?? '⏱');
    setNote(existing.note ?? '');
    setGroupId(existing.groupId);
    setDurations(existing.durations);
    setDefaultMin(existing.defaultDurationMin);
    setGoal(existing.dailyGoalMin ?? 0);
  }, [existing?.id]);

  function addDuration() {
    if (!durations.includes(addVal)) setDurations((d) => [...d, addVal].sort((a, b) => a - b));
  }
  function removeDuration(m: number) {
    setDurations((d) => d.filter((x) => x !== m));
    if (defaultMin === m) setDefaultMin(null);
  }

  async function newGroup() {
    const name = window.prompt('New group name (e.g. Morning)');
    if (!name) return;
    const g = await saveGroup.mutateAsync({ name, emoji: '📌', sortOrder: groups.length });
    setGroupId(g.id);
  }

  async function onSave() {
    if (!name.trim() || durations.length === 0) return;
    await save.mutateAsync({
      id,
      name: name.trim(),
      emoji,
      note: note.trim() || null,
      groupId,
      durations,
      defaultDurationMin: defaultMin ?? durations[0],
      dailyGoalMin: goal > 0 ? goal : null,
      timerType: 'simple',
    });
    navigate('/');
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="pt-1 text-2xl font-bold">{existing ? 'Edit habit' : 'New habit'}</h1>

      <div className="flex items-center gap-3">
        <input className="input w-16 text-center text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
        <input className="input flex-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EMOJI.map((e) => (
          <button key={e} onClick={() => setEmoji(e)} className="rounded-lg bg-ink-700/50 p-1.5 text-lg hover:bg-ink-600/60">{e}</button>
        ))}
      </div>

      <input className="input" placeholder="Note (e.g. in French)" value={note} onChange={(e) => setNote(e.target.value)} />

      <div>
        <label className="label">Group</label>
        <div className="mt-1 flex gap-2">
          <select className="input flex-1" value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value || null)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>
            ))}
          </select>
          <button className="btn-outline px-3" onClick={newGroup}>＋</button>
        </div>
      </div>

      <div>
        <label className="label">Durations (minutes) · tap to set default</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {durations.map((m) => (
            <span key={m} className={`chip gap-1 ${m === defaultMin ? 'chip-active' : ''}`}>
              <button onClick={() => setDefaultMin(m)}>{m}</button>
              <button onClick={() => removeDuration(m)} className="opacity-60 hover:opacity-100">✕</button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Stepper value={addVal} onChange={setAddVal} min={1} max={180} suffix="min" />
          <button className="btn-outline px-3" onClick={addDuration}>Add</button>
        </div>
      </div>

      <div className="card p-4">
        <Stepper label="Daily goal (0 = none)" value={goal} onChange={setGoal} min={0} max={600} step={5} suffix="min" />
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
