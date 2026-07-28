'use client';

import { useState } from 'react';
import { claimPortalAccount } from '@/lib/actions';
import { AlertDialog } from '@/components/Modal';

/**
 * Shown on a borrower's statement page when that borrower has no login yet.
 * Lets them set their own password and get into the portal without an
 * admin having to send an invite first.
 *
 * The email is NOT collected here -- the server takes it from the loan
 * record, so holding the link cannot bind the loan to another address.
 */
export default function ClaimAccountCard({
  token, email,
}: { token: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (password.length < 6) { setErr('Please choose a password of at least 6 characters.'); return; }
    if (password !== confirm) { setErr('The two passwords do not match.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await claimPortalAccount(token, password);
      if (!res.ok) { setErr(res.error || 'Could not set up your account.'); setBusy(false); return; }
      setDone(res.message || 'Your account is ready.');
      setOpen(false);
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <div className="wrap" style={{ maxWidth: 960, paddingBottom: 0 }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: 'var(--navy)', fontWeight: 700, marginBottom: 4 }}>
              Set up your portal account
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Create a password for <b>{email}</b> and you can sign in any time to see
              every loan of yours, review past statements, and download PDFs &mdash;
              without needing this link.
            </p>
          </div>
          {!open && (
            <button className="btn" onClick={() => { setErr(''); setOpen(true); }}>
              Create my account
            </button>
          )}
        </div>

        {open && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
            <div className="field-wrap">
              <label>Choose a password</label>
              <input
                className="field" type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters" autoComplete="new-password"
              />
            </div>
            <div className="field-wrap">
              <label>Confirm password</label>
              <input
                className="field" type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn secondary" disabled={busy} onClick={() => { setOpen(false); setErr(''); }}>
                Cancel
              </button>
              <button className="btn" disabled={busy} onClick={submit}>
                {busy ? 'Setting up\u2026' : 'Create account'}
              </button>
            </div>
          </div>
        )}

        {!open && err && <div className="alert error" style={{ marginBottom: 0 }}>{err}</div>}
      </div>

      <AlertDialog
        open={!!done}
        title="Account created"
        message={done || ''}
        tone="success"
        onClose={() => { setDone(null); window.location.href = '/login'; }}
      />
    </div>
  );
}
