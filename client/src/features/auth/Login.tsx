import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Timer } from 'lucide-react';
import { api } from '../../lib/api';

export function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const m = useMutation({
    mutationFn: () => api.post('/auth/login', { email, password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  return (
    <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center px-6">
      <div className="mb-8 w-full">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-white"><Timer size={24} /></div>
        <h1 className="mt-5 text-2xl font-semibold">Timer</h1>
        <p className="text-sm text-slate-400">Your week, tasks and habits. In one place.</p>
      </div>
      <form
        className="card w-full space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <label className="block text-xs font-medium text-slate-400">Username<input className="input mt-1.5" type="text" placeholder="Username" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="block text-xs font-medium text-slate-400">Password<input className="input mt-1.5" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {m.isError && <p className="text-sm text-rose-400">Invalid email or password.</p>}
        <button className="btn-accent w-full" type="submit" disabled={m.isPending}>
          {m.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
