'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';

  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const supabase = browserClient();

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push(next);
    router.refresh();
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setInfo('Check your email for a sign-in link.');
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <h1 className="title">Jay Capital</h1>
        <div className="rule" />

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button
            className={`btn ${mode === 'password' ? '' : 'secondary'}`}
            style={{ flex: 1 }}
            onClick={() => { setMode('password'); setError(''); setInfo(''); }}
            type="button"
          >
            Password
          </button>
          <button
            className={`btn ${mode === 'magic' ? '' : 'secondary'}`}
            style={{ flex: 1 }}
            onClick={() => { setMode('magic'); setError(''); setInfo(''); }}
            type="button"
          >
            Email link
          </button>
        </div>

        <form onSubmit={mode === 'password' ? signInPassword : sendMagicLink}>
          <div className="field-wrap" style={{ marginBottom: 14 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email" className="field" type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          {mode === 'password' && (
            <div className="field-wrap" style={{ marginBottom: 14 }}>
              <label htmlFor="password">Password</label>
              <input
                id="password" className="field" type="password" required
                value={password} onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          )}

          {error && <div className="alert error">{error}</div>}
          {info && <div className="alert info">{info}</div>}

          <button className="btn" style={{ width: '100%' }} disabled={busy} type="submit">
            {busy ? 'Working\u2026' : mode === 'password' ? 'Sign in' : 'Send sign-in link'}
          </button>
        </form>

        <p className="muted" style={{ fontSize: 12, marginTop: 18, textAlign: 'center' }}>
          Borrowers: use the statement link emailed to you, or sign in above if
          you have an account.
        </p>
      </div>
    </div>
  );
}


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-shell"><div className="auth-card card"><h1 className="title">Jay Capital</h1></div></div>}>
      <LoginForm />
    </Suspense>
  );
}
