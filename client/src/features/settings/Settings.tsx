import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { CalendarIntegration } from './CalendarIntegration';
import { Moon, Sun, Plus } from 'lucide-react';
import { ACCENTS, THEMES, applyAccent, applyTheme } from '../../lib/theme';
import { HabitIcon } from '../../lib/habitIcons';
import {
  useDeleteGroup, useGroups, useMe, useSaveGroup, useSaveSettings, useSettings,
} from '../../lib/hooks';
import { Stepper } from '../../components/Stepper';
import { audio, setVolume, unlockAudio } from '../../engine/audio';

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: s } = useSettings();
  const save = useSaveSettings();
  const { data: groups = [] } = useGroups();
  const saveGroup = useSaveGroup();
  const delGroup = useDeleteGroup();
  const fileRef = useRef<HTMLInputElement>(null);

  async function signOut() {
    await api.post('/auth/logout');
    qc.setQueryData(['me'], { user: null });
    qc.clear();
  }

  async function exportData() {
    const data = await api.get('/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File) {
    const text = await file.text();
    await api.post('/import', JSON.parse(text));
    qc.invalidateQueries();
  }

  const Toggle = ({ k, label }: { k: 'beeps' | 'voice' | 'keepAwake'; label: string }) => (
    <label className="flex items-center justify-between py-1 text-sm">
      {label}
      <input
        type="checkbox"
        className="h-5 w-5 accent-accent"
        checked={!!s?.[k]}
        onChange={(e) => save.mutate({ [k]: e.target.checked })}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Settings</h1>
      </header>

      <section className="card space-y-2 p-4">
        <div className="text-sm text-slate-400">Signed in as</div>
        <div className="font-medium">{me?.user?.email}</div>
        <button className="btn-outline mt-2 w-full" onClick={signOut}>Sign out</button>
      </section>

      <ChangePassword />

      <section>
        <h2 className="label mb-2">Theme</h2>
        <div className="flex gap-2">
          {THEMES.map((t) => {
            const activeTheme = s?.theme === 'day' ? 'day' : 'night';
            const active = activeTheme === t.name;
            return (
              <button
                key={t.name}
                onClick={() => { applyTheme(t.name); save.mutate({ theme: t.name }); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  active ? 'border-accent bg-accent-soft text-accent' : 'border-ink-600 text-slate-300 hover:bg-ink-700'
                }`}
              >
                {t.icon === 'moon' ? <Moon size={16} /> : <Sun size={16} />} {t.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="label mb-2">Accent</h2>
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.name}
              onClick={() => { applyAccent(a.name); save.mutate({ accent: a.name }); }}
              className={`h-9 w-9 rounded-full border-2 border-transparent ${s?.accent === a.name ? 'ring-2 ring-accent ring-offset-2 ring-offset-ink-900' : ''}`}
              style={{ backgroundColor: a.rgb }}
              title={a.label}
            />
          ))}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="label mb-2">Sound &amp; screen</h2>
        <Toggle k="beeps" label="Countdown beeps" />
        <Toggle k="voice" label="Spoken cues" />
        <Toggle k="keepAwake" label="Keep screen awake during a run" />
        <div className="mt-3 border-t border-ink-700 pt-3">
          <Stepper
            label="Volume"
            value={s?.volume ?? 100}
            onChange={(v) => {
              // Apply + preview instantly (this click is the gesture that unlocks audio),
              // then persist so it carries across all timers.
              unlockAudio();
              setVolume(v);
              audio.beep();
              save.mutate({ volume: v });
            }}
            min={0}
            max={200}
            step={10}
            suffix="%"
          />
        </div>
        <div className="mt-3 border-t border-ink-700 pt-3">
          <Stepper label="Default prep countdown" value={s?.prepSeconds ?? 5} onChange={(v) => save.mutate({ prepSeconds: v })} min={0} max={30} suffix="s" />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="label">Groups</h2>
          <button
            className="text-sm text-accent"
            onClick={async () => {
              const name = window.prompt('Group name');
              if (name) saveGroup.mutate({ name, emoji: 'pin', sortOrder: groups.length });
            }}
          >
            <span className="inline-flex items-center gap-1"><Plus size={14} /> Add</span>
          </button>
        </div>
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g.id} className="card flex items-center justify-between p-3 text-sm">
              <span className="flex items-center gap-2"><HabitIcon name={g.emoji} size={16} className="text-slate-300" /> {g.name}</span>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <button
                  className="hover:text-slate-300"
                  onClick={() => {
                    const name = window.prompt('Rename group', g.name);
                    if (name) saveGroup.mutate({ id: g.id, name });
                  }}
                >
                  Rename
                </button>
                <button className="hover:text-rose-400" onClick={() => delGroup.mutate(g.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <CalendarIntegration />

      <section className="card space-y-2 p-4">
        <h2 className="label">Data</h2>
        <div className="flex gap-3">
          <button className="btn-outline flex-1" onClick={exportData}>Export JSON</button>
          <button className="btn-outline flex-1" onClick={() => fileRef.current?.click()}>Import</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
        />
      </section>

      <p className="pb-4 text-center text-xs text-slate-600">timer.musel.dev</p>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [state, setState] = useState<'idle' | 'ok' | 'err'>('idle');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setState('idle');
    try {
      await api.post('/auth/change-password', { current, next });
      setState('ok');
      setCurrent('');
      setNext('');
    } catch {
      setState('err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4">
      <h2 className="label mb-2">Change password</h2>
      <form className="space-y-2" onSubmit={submit}>
        <input className="input" type="password" placeholder="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <input className="input" type="password" placeholder="New password (min 6)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={6} required />
        {state === 'ok' && <p className="text-sm text-accent">Password updated.</p>}
        {state === 'err' && <p className="text-sm text-rose-400">Current password is incorrect.</p>}
        <button className="btn-outline w-full" type="submit" disabled={busy}>Update password</button>
      </form>
    </section>
  );
}
