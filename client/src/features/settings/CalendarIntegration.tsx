import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface CalConfig {
  configured: boolean;
  clientEmail?: string | null;
  readCalendarIds?: string[];
  pushCalendarId?: string | null;
}

interface TestResult {
  calendarId: string;
  ok: boolean;
  error?: string;
}

export function CalendarIntegration() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ['calendar-config'], queryFn: () => api.get<CalConfig>('/calendar/config') });
  const [keyJson, setKeyJson] = useState('');
  // null = "not edited yet, show the stored value"
  const [readIds, setReadIds] = useState<string | null>(null);
  const [pushId, setPushId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [testing, setTesting] = useState(false);

  const readValue = readIds ?? cfg?.readCalendarIds?.join(', ') ?? '';
  const pushValue = pushId ?? cfg?.pushCalendarId ?? '';

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['calendar-config'] });
    qc.invalidateQueries({ queryKey: ['calendar-events'] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<CalConfig>('/calendar/config', {
        ...(keyJson.trim() ? { serviceAccountJson: keyJson.trim() } : {}),
        readCalendarIds: readValue.split(',').map((s) => s.trim()).filter(Boolean),
        pushCalendarId: pushValue.trim() || null,
      }),
    onSuccess: () => {
      setKeyJson('');
      setTestResults(null);
      invalidate();
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.del('/calendar/config'),
    onSuccess: () => {
      setReadIds(null);
      setPushId(null);
      setTestResults(null);
      invalidate();
    },
  });

  async function test() {
    setTesting(true);
    setTestResults(null);
    try {
      const r = await api.post<{ results: TestResult[] }>('/calendar/test');
      setTestResults(r.results);
    } catch {
      setTestResults([{ calendarId: '(connection)', ok: false, error: 'request failed' }]);
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="card space-y-3 p-4">
      <h2 className="label">Google Calendar</h2>
      {cfg?.configured ? (
        <p className="text-sm text-slate-400">
          Connected as <span className="break-all text-slate-200">{cfg.clientEmail}</span> — share your calendars with this email.
        </p>
      ) : (
        <p className="text-sm text-slate-400">
          Paste a Google service-account key to connect (setup steps in <code>docs/gcal-setup.md</code>).
        </p>
      )}
      <textarea
        className="input h-24 font-mono text-xs"
        placeholder={cfg?.configured ? 'Paste a new key JSON to replace the stored one' : 'Service-account key JSON ({"type":"service_account",...})'}
        value={keyJson}
        onChange={(e) => setKeyJson(e.target.value)}
      />
      <input
        className="input"
        placeholder="Read calendar IDs, comma-separated (e.g. you@gmail.com)"
        value={readValue}
        onChange={(e) => setReadIds(e.target.value)}
      />
      <input
        className="input"
        placeholder="Planner (push) calendar ID — optional"
        value={pushValue}
        onChange={(e) => setPushId(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-outline flex-1"
          onClick={() => save.mutate()}
          disabled={save.isPending || (!cfg?.configured && !keyJson.trim())}
        >
          Save
        </button>
        <button className="btn-outline flex-1" onClick={test} disabled={!cfg?.configured || testing}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
        {cfg?.configured && (
          <button className="btn-outline flex-1 text-rose-400" onClick={() => disconnect.mutate()}>
            Disconnect
          </button>
        )}
      </div>
      {save.isError && <p className="text-sm text-rose-400">Save failed — check the key JSON.</p>}
      {testResults && (
        <ul className="space-y-1 text-sm">
          {testResults.map((r) => (
            <li key={r.calendarId} className={r.ok ? 'text-accent' : 'text-rose-400'}>
              {r.ok ? '✓' : '✗'} <span className="break-all">{r.calendarId}</span>
              {r.error ? ` — ${r.error}` : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
