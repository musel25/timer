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
      <div className="mb-8 text-center">
        <div className="flex justify-center text-accent"><Timer size={48} /></div>
        <h1 className="mt-3 text-2xl font-bold">Timer</h1>
        <p className="text-sm text-slate-400">Interval timer &amp; habit tracker</p>
      </div>
      <form
        className="w-full space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <input className="input" type="text" placeholder="Username" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {m.isError && <p className="text-sm text-rose-400">Invalid email or password.</p>}
        <button className="btn-accent w-full" type="submit" disabled={m.isPending}>
          {m.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
