'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBorrowerUser } from '@/lib/actions';
import { Modal, AlertDialog } from '@/components/Modal';
import PasswordStrength from '@/components/PasswordStrength';
import PasswordField from '@/components/PasswordField';
import { checkPassword } from '@/lib/password';

/**
 * On a loan's detail page: add a BORROWER login for this loan's borrower.
 * Two modes:
 *   - Invite by email (Supabase sends a set-password invite), or
 *   - Set it up myself: provide a temporary password, and optionally email
 *     the credentials to the borrower.
 */
export default function AddBorrowerModal({
  loanId, borrowerId, borrowerName, borrowerEmail,
}: { loanId: string; borrowerId: string; borrowerName: string; borrowerEmail: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'invite' | 'manual'>('invite');
  const [email, setEmail] = useState(borrowerEmail || '');
  const [name, setName] = useState(borrowerName || '');
  const [tempPw, setTempPw] = useState('');
  const [emailCreds, setEmailCreds] = useState(true);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) { setErr('Email is required.'); return; }
    if (mode === 'manual') {
      const strength = checkPassword(tempPw, email);
      if (!strength.ok) { setErr(strength.problems[0]); return; }
    }
    setBusy(true); setErr('');
    try {
      const res = await createBorrowerUser({
        loanId, borrowerId, email: email.trim(), fullName: name.trim(),
        mode, tempPassword: mode === 'manual' ? tempPw : undefined,
        emailCredentials: mode === 'manual' ? emailCreds : false,
      });
      if (!res.ok) { setErr(res.error || 'Could not create the login.'); setBusy(false); return; }
      setOpen(false);
      setDone(res.message || 'Borrower login created.');
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <button className="btn secondary" onClick={() => { setErr(''); setOpen(true); }}>Add borrower login</button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Add Borrower Login" maxWidth={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={`btn ${mode === 'invite' ? '' : 'secondary'}`} style={{ flex: 1 }} onClick={() => setMode('invite')}>Invite by email</button>
            <button type="button" className={`btn ${mode === 'manual' ? '' : 'secondary'}`} style={{ flex: 1 }} onClick={() => setMode('manual')}>Set up myself</button>
          </div>

          <div className="field-wrap">
            <label>Email</label>
            <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="field-wrap">
            <label>Name</label>
            <input className="field" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {mode === 'invite' ? (
            <p className="muted" style={{ margin: 0 }}>
              They&apos;ll receive an email invitation to set their own password and access their portal.
            </p>
          ) : (
            <>
              <div className="field-wrap">
                <label>Temporary Password</label>
                <PasswordField value={tempPw} onChange={setTempPw} />
                <PasswordStrength password={tempPw} email={email} />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={emailCreds} onChange={e => setEmailCreds(e.target.checked)} />
                Email these login details to the borrower
              </label>
            </>
          )}

          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Working…' : 'Create login'}</button>
          </div>
        </div>
      </Modal>

      <AlertDialog open={!!done} title="Borrower login created" message={done || ''} tone="success" onClose={() => setDone(null)} />
    </>
  );
}
