'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/Logo';
import { inspectSignupToken, completePortalSignup } from '@/lib/signup';
import { browserClient } from '@/lib/supabase-browser';

export default function SetSignupPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [noLoans, setNoLoans] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await inspectSignupToken(params.token);
      if (!res.ok) setErr(res.error || 'This link is not valid.');
      else setEmail(res.email || '');
      setChecking(false);
    })();
  }, [params.token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setErr('Please choose a password of at least 8 characters.'); return; }
    if (password !== confirm) { setErr('The two passwords do not match.'); return; }
    setBusy(true); setErr('');

    const res = await completePortalSignup(params.token, password);
    if (!res.ok) { setErr(res.error || 'Could not create your account.'); setBusy(false); return; }

    // Sign them in with the password they just chose.
    const supabase = browserClient();
    await supabase.auth.signInWithPassword({ email: res.email!, password });

    if (res.message === 'noloans') { setNoLoans(res.email || email); setBusy(false); return; }

    router.replace('/portal');
    router.refresh();
  }

  if (noLoans) {
    return (
      <div className="auth-shell">
        <div className="auth-card card" style={{ maxWidth: 480 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={30} variant="stacked" /></div>
          <h1 className="title" style={{ fontSize: 18, marginTop: 16 }}>No Loans Found</h1>
          <div className="rule" />
          <p>
            Your account is set up, but we couldn&apos;t find any loans registered to{' '}
            <b>{noLoans}</b>.
          </p>
          <p className="muted">
            Loans are matched by the email address on file for them. Please check which
            address was used for your loan — you can change the email on your account
            from the portal — or contact us and we&apos;ll sort it out.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            <button className="btn" onClick={() => { router.replace('/portal'); router.refresh(); }}>
              Go to my portal
            </button>
            <a className="btn secondary" style={{ textAlign: 'center', textDecoration: 'none' }}
               href="mailto:Yossi@JayCapitalFunding.com?subject=Portal%20access%20help">
              Email Jay Capital Funding
            </a>
            <a className="btn secondary" style={{ textAlign: 'center', textDecoration: 'none' }} href="tel:+18458280731">
              Call (845) 828-0731
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo size={30} variant="stacked" /></div>
        <h1 className="title" style={{ fontSize: 18, marginTop: 16 }}>Choose a Password</h1>
        <div className="rule" />

        {checking ? (
          <p className="muted" style={{ textAlign: 'center' }}>Checking your link…</p>
        ) : !email ? (
          <>
            <div className="alert error">{err}</div>
            <Link className="btn" style={{ width: '100%', textAlign: 'center', textDecoration: 'none', display: 'block' }} href="/signup">
              Request a new link
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted" style={{ marginTop: 0 }}>
              Setting up the portal for <b>{email}</b>.
            </p>
            <div className="field-wrap" style={{ marginBottom: 14 }}>
              <label htmlFor="pw">Password</label>
              <input id="pw" className="field" type="password" required autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="field-wrap" style={{ marginBottom: 14 }}>
              <label htmlFor="pw2">Confirm password</label>
              <input id="pw2" className="field" type="password" required autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)} />
            </div>
            {err && <div className="alert error">{err}</div>}
            <button className="btn" style={{ width: '100%' }} disabled={busy} type="submit">
              {busy ? 'Creating your account…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
