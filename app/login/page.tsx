'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import PasswordField from '@/components/PasswordField';
import { browserClient } from '@/lib/supabase-browser';
import { requestPasswordReset } from '@/lib/signup';

/**
 * Password sign-in only.
 *
 * The Supabase magic-link option was removed: it is a PKCE flow whose code
 * verifier lives in the browser that started it, so opening the emailed link
 * from a mail app failed with "PKCE code verifier not found in storage".
 * Borrowers create an account at /signup and reset via our own SMTP; admin
 * and staff accounts are created by an existing admin.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/go';

  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const timedOut = params.get('timedout') === '1';

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    const supabase = browserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push(next);
    router.refresh();
  }

  async function forgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setInfo('');
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (!res.ok) { setError(res.error || 'Could not send the reset email.'); return; }
    setInfo(res.message || '');
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={30} variant="stacked" /></div>
        <h1 className="title" style={{ fontSize: 18, marginTop: 16 }}>
          {mode === 'signin' ? 'Sign In' : 'Reset Password'}
        </h1>
        <div className="rule" />

        {timedOut && (
          <div className="alert info" style={{ marginTop: 0 }}>
            You were signed out after a period of inactivity. Please sign in again.
          </div>
        )}

        <form onSubmit={mode === 'signin' ? signIn : forgot}>
          <div className="field-wrap" style={{ marginBottom: 14 }}>
            <label htmlFor="email">Email</label>
            <input id="email" className="field" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          {mode === 'signin' && (
            <div className="field-wrap" style={{ marginBottom: 14 }}>
              <label htmlFor="password">Password</label>
              <PasswordField id="password" required autoComplete="current-password"
                value={password} onChange={setPassword} />
            </div>
          )}

          {error && <div className="alert error">{error}</div>}
          {info && <div className="alert info">{info}</div>}

          <button className="btn" style={{ width: '100%' }} disabled={busy} type="submit">
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Email me a reset link'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 16, fontSize: 13 }}>
          <button className="btn secondary" style={{ padding: '6px 10px', fontSize: 13 }}
            onClick={() => { setMode(m => (m === 'signin' ? 'forgot' : 'signin')); setError(''); setInfo(''); }}>
            {mode === 'signin' ? 'Forgot password?' : 'Back to sign in'}
          </button>
          <Link className="btn secondary" style={{ padding: '6px 10px', fontSize: 13, textDecoration: 'none' }} href="/signup">
            Create an account
          </Link>
        </div>

        <p className="muted" style={{ fontSize: 12, marginTop: 18, textAlign: 'center' }}>
          Borrowers: use the email address registered on your loan.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth-shell"><div className="auth-card card" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
