'use client';

import { useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { requestPortalSignup } from '@/lib/signup';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const res = await requestPortalSignup(email);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not send the email.'); return; }
    setSent(res.message || '');
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={30} variant="stacked" /></div>
        <h1 className="title" style={{ fontSize: 18, marginTop: 16 }}>Create Your Account</h1>
        <div className="rule" />

        {sent ? (
          <>
            <div className="alert info">{sent}</div>
            <p className="muted" style={{ fontSize: 13 }}>
              The link is valid for one hour and can be used once. If it doesn&apos;t arrive
              within a few minutes, check your spam folder.
            </p>
            <Link className="btn" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block' }} href="/login">
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="alert info" style={{ marginTop: 0 }}>
              <b>Please use the email address registered on your loan.</b> That is how we
              match your account to your loans. If you use a different address, your
              portal will be empty until it&apos;s corrected.
            </div>

            <div className="field-wrap" style={{ marginBottom: 14 }}>
              <label htmlFor="email">Email</label>
              <input
                id="email" className="field" type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>

            {err && <div className="alert error">{err}</div>}

            <button className="btn" style={{ width: '100%' }} disabled={busy} type="submit">
              {busy ? 'Sending…' : 'Email me a link'}
            </button>

            <p className="muted" style={{ fontSize: 12, marginTop: 18, textAlign: 'center' }}>
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
