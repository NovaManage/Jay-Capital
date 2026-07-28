'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserProfile, setUserActive, sendUserPasswordReset, deleteUser } from '@/lib/actions';
import { Modal, ConfirmDialog, AlertDialog } from '@/components/Modal';

export interface UserRow {
  id: string; email: string; full_name: string | null;
  role: 'admin' | 'staff' | 'borrower'; active: boolean;
}

export default function UserRowControls({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(user.full_name ?? '');
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [err, setErr] = useState('');
  const [note, setNote] = useState<{ msg: string; tone: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const done = (res: any, fallback: string) => {
    setBusy(false);
    setNote(res.ok
      ? { msg: res.message || 'Done.', tone: 'success' }
      : { msg: res.error || fallback, tone: 'error' });
    router.refresh();
  };

  async function save() {
    if (!email.trim()) { setErr('Email is required.'); return; }
    setBusy(true); setErr('');
    const res = await updateUserProfile(user.id, { fullName: name, email, role });
    if (!res.ok) { setErr(res.error || 'Could not update the user.'); setBusy(false); return; }
    setEditOpen(false);
    done(res, 'Could not update the user.');
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn secondary" disabled={busy} onClick={() => { setErr(''); setEditOpen(true); }}>Edit</button>
        <button className="btn secondary" disabled={busy} onClick={() => setConfirmReset(true)}>Reset password</button>
        {!isSelf && (user.active
          ? <button className="btn secondary" disabled={busy} onClick={() => setConfirmOff(true)}>Inactivate</button>
          : <button className="btn" disabled={busy} onClick={async () => { setBusy(true); done(await setUserActive(user.id, true), 'Could not reactivate.'); }}>Reactivate</button>
        )}
        {!isSelf && <button className="btn danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>}
      </div>

      <Modal open={editOpen} onClose={() => !busy && setEditOpen(false)} title="Edit User" maxWidth={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-wrap"><label>Name</label>
            <input className="field" value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field-wrap"><label>Email</label>
            <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field-wrap"><label>Role</label>
            <select className="field" value={role} onChange={e => setRole(e.target.value as any)} disabled={isSelf}>
              <option value="admin">admin</option>
              <option value="staff">staff</option>
              <option value="borrower">borrower</option>
            </select>
            {isSelf && <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>You can&apos;t change your own role.</p>}
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving\u2026' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmReset}
        title="Send password reset"
        message={`Email a password reset link to ${user.email}?`}
        confirmLabel="Send link"
        onConfirm={async () => { setConfirmReset(false); setBusy(true); done(await sendUserPasswordReset(user.email), 'Could not send the reset email.'); }}
        onCancel={() => setConfirmReset(false)}
      />

      <ConfirmDialog
        open={confirmOff}
        title="Inactivate user"
        message={`Inactivate ${user.email}? They will immediately be unable to sign in. Their records are kept and you can reactivate them at any time.`}
        confirmLabel="Inactivate" danger
        onConfirm={async () => { setConfirmOff(false); setBusy(true); done(await setUserActive(user.id, false), 'Could not inactivate.'); }}
        onCancel={() => setConfirmOff(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete user"
        message={`Permanently delete the login for ${user.email}? This cannot be undone. Their loans and borrower records are kept, but the borrower will lose portal access until a new login is created.`}
        confirmLabel="Delete user" danger
        onConfirm={async () => { setConfirmDelete(false); setBusy(true); done(await deleteUser(user.id), 'Could not delete the user.'); }}
        onCancel={() => setConfirmDelete(false)}
      />

      <AlertDialog
        open={!!note}
        title={note?.tone === 'error' ? "That didn't work" : 'Users'}
        message={note?.msg || ''}
        tone={note?.tone || 'success'}
        onClose={() => setNote(null)}
      />
    </>
  );
}
