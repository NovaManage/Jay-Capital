'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changeMyEmail } from '@/lib/signup';
import { Modal, AlertDialog } from '@/components/Modal';

/**
 * Lives in the borrower's top ribbon, beside Sign out. Split out of
 * PortalLoans so the nav (a server component) can host it.
 */
export default function ChangeEmailButton({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    if (!newEmail.trim()) { setErr('Please enter an email address.'); return; }
    setBusy(true); setErr('');
    const res = await changeMyEmail(newEmail);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not change your email.'); return; }
    setOpen(false);
    setNote(res.message || 'Your email has been updated.');
    router.refresh();
  }

  return (
    <>
      <button className="btn secondary" onClick={() => { setErr(''); setNewEmail(''); setOpen(true); }}>
        Change my email
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Change My Email" maxWidth={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ margin: 0 }}>
            Your loans are matched to you by email. Changing it here re-checks for loans
            registered to the new address. Signed in as <b>{userEmail}</b>.
          </p>
          <div className="field-wrap">
            <label>New email</label>
            <input className="field" type="email" value={newEmail}
              onChange={e => setNewEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save email'}</button>
          </div>
        </div>
      </Modal>

      <AlertDialog open={!!note} title="Account updated" message={note || ''} tone="success" onClose={() => setNote(null)} />
    </>
  );
}
