'use client';

import Logo from '@/components/Logo';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';

/**
 * Where an invited or reset user actually chooses a password.
 * The app previously had no such screen at all: an invite signed the user in
 * and dropped them on the dashboard with no password ever set, so they could
 * never sign in again.
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      // Created lazily: instantiating during render breaks prerendering.
      const supabase = browserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Your link has expired or was already used. Please ask for a new invite or reset email.'); }
      else { setEmail(user.email || ''); }
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) { setError('Please choose a password of at least 6 characters.'); return; }
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true); setError('');

    const supabase = browserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setBusy(false); return; }

    setDone(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
    router.replace(profile?.role === 'borrower' ? '/portal' : '/admin');
    router.refresh();
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={30} variant="stacked" /></div>
        <h1 className="title" style={{ fontSize: 18, marginTop: 14 }}>Set Your Password</h1>
        <div className="rule" />

        {checking ? (
          <p className="muted" style={{ textAlign: 'center' }}>Checking your link&hellip;</p>
        ) : error && !email ? (
          <>
            <div className="alert error">{error}</div>
            <a className="btn" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block' }} href="/login">
              Back to sign in
            </a>
          </>
        ) : (
          <form onSubmit={submit}>
            {email && (
              <p className="muted" style={{ marginTop: 0 }}>
                Choose a password for <b>{email}</b>. You&apos;ll use it to sign in from now on.
              </p>
            )}
            <div className="field-wrap" style={{ marginBottom: 14 }}>
              <label htmlFor="pw">New password</label>
              <input id="pw" className="field" type="password" value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="new-password"
                placeholder="At least 6 characters" required />
            </div>
            <div className="field-wrap" style={{ marginBottom: 14 }}>
              <label htmlFor="pw2">Confirm password</label>
              <input id="pw2" className="field" type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required />
            </div>
            {error && <div className="alert error">{error}</div>}
            <button className="btn" style={{ width: '100%' }} disabled={busy || done} type="submit">
              {busy ? 'Saving\u2026' : done ? 'Saved' : 'Save password and continue'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
