'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inviteAdminUser } from '@/lib/actions';
import { Modal, AlertDialog } from '@/components/Modal';
import PasswordStrength from '@/components/PasswordStrength';
import PasswordField from '@/components/PasswordField';
import { checkPassword } from '@/lib/password';

/**
 * Admin invites a new ADMIN or STAFF user by email (button + popup).
 * Borrowers are NOT created here - they're added from their loan's detail page.
 */
export default function InviteUser() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
  const [mode, setMode] = useState<'invite' | 'manual'>('invite');
  const [tempPw, setTempPw] = useState('');
  const [emailCreds, setEmailCreds] = useState(true);
  const [busy, setBusy] = useState(false);
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
      const res = await inviteAdminUser({
        email: email.trim(), fullName: name.trim(), role, mode,
        tempPassword: mode === 'manual' ? tempPw : undefined,
        emailCredentials: mode === 'manual' ? emailCreds : false,
      });
      if (!res.ok) { setErr(res.error || 'Could not create the user.'); setBusy(false); return; }
      setOpen(false); setEmail(''); setName(''); setTempPw('');
      setDone(res.message || 'User created.');
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <button className="btn" onClick={() => { setErr(''); setOpen(true); }}>Add admin / staff user</button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Add Admin / Staff User" maxWidth={500}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={`btn ${mode === 'invite' ? '' : 'secondary'}`} style={{ flex: 1 }} onClick={() => setMode('invite')}>Invite by email</button>
            <button type="button" className={`btn ${mode === 'manual' ? '' : 'secondary'}`} style={{ flex: 1 }} onClick={() => setMode('manual')}>Set up myself</button>
          </div>

          <div className="field-wrap"><label>Email</label><input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field-wrap"><label>Name</label><input className="field" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field-wrap"><label>Role</label>
            <select className="field" value={role} onChange={e => setRole(e.target.value as any)}>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
          </div>

          {mode === 'invite' ? (
            <p className="muted" style={{ margin: 0 }}>They&apos;ll receive an email to set a password and join the portal.</p>
          ) : (
            <>
              <div className="field-wrap"><label>Temporary Password</label><PasswordField value={tempPw} onChange={setTempPw} />
                <PasswordStrength password={tempPw} email={email} /></div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={emailCreds} onChange={e => setEmailCreds(e.target.checked)} />
                Email these login details to the user
              </label>
            </>
          )}

          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Working…' : 'Create user'}</button>
          </div>
        </div>
      </Modal>

      <AlertDialog open={!!done} title="User created" message={done || ''} tone="success" onClose={() => setDone(null)} />
    </div>
  );
}
