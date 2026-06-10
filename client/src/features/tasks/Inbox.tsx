import { useState } from 'react';
import { useTasks } from '../../lib/hooks';
import type { Task } from '../../lib/types';
import { TaskRow } from './TaskRow';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';

export function Inbox() {
  const { data: tasks = [] } = useTasks();
  const [editing, setEditing] = useState<Task | null>(null);
  const inbox = tasks.filter((t) => t.date === null)
    .sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="hero">
        <h1 className="text-3xl font-bold md:text-4xl">Inbox</h1>
        <p className="mt-1 text-sm text-slate-300">Undated tasks — schedule them from the Week or Month view.</p>
      </header>
      <section className="card p-5">
        <div className="divide-y divide-ink-600">
          {inbox.map((t) => <TaskRow key={t.id} task={t} onEdit={setEditing} />)}
        </div>
        {inbox.length === 0 && <p className="py-3 text-sm text-slate-500">Inbox is empty.</p>}
        <div className="mt-2"><QuickAdd date={null} placeholder="Capture a task…" /></div>
      </section>
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
