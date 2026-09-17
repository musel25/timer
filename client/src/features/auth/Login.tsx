import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { Brand } from '../../components/Brand';

export function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const m = useMutation({
    mutationFn: () => api.post('/auth/login', { email, password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  return (
    <div className="login-page">
      <div className="login-welcome">
        <Brand />
        <div className="login-intro"><h1>A little clarity.<br />A better week.</h1><p>Make room for what matters. Plan your days, keep your tasks close, and find your rhythm.</p></div>
        <div className="login-rhythm" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></div>
        <span className="login-caption">Your week, at your own pace.</span>
      </div>
      <div className="login-form-panel">
      <div className="login-form-heading"><h2>Welcome back</h2><p>Sign in to your planning space.</p></div>
      <form
        className="login-form"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <label className="login-label">Username<input className="input" type="text" placeholder="Your username" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="login-label">Password<input className="input" type="password" placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {m.isError && <p className="text-sm text-rose-400">Invalid email or password.</p>}
        <button className="btn-accent w-full" type="submit" disabled={m.isPending}>
          {m.isPending ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>
      </div>
    </div>
  );
}
