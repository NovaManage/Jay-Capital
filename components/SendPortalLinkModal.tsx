'use client';

import { useState } from 'react';
import { sendPortalWelcome } from '@/lib/email';
import { Modal, AlertDialog } from '@/components/Modal';

/**
 * Emails the borrower a friendly welcome with their statement/portal link
 * and a short description of what they can do once signed in.
 */
export default function SendPortalLinkModal({
  loanId, borrowerEmail,
}: { loanId: string; borrowerEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(borrowerEmail || '');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!email.trim()) { setErr('Email is required.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await sendPortalWelcome(loanId, email.trim());
      if (!res.ok) { setErr(res.error || 'Could not send the welcome email.'); setBusy(false); return; }
      setOpen(false);
      setDone(`Welcome email with the portal link sent to ${res.to}.`);
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <button className="btn secondary" onClick={() => { setErr(''); setOpen(true); }}>Email portal link</button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Email Portal Welcome" maxWidth={480}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="muted" style={{ margin: 0 }}>
            Sends the borrower a welcome email with their private statement link and a
            short overview of what they can do in the portal.
          </p>
          <div className="field-wrap">
            <label>Send to</label>
            <input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send welcome'}</button>
          </div>
        </div>
      </Modal>

      <AlertDialog open={!!done} title="Welcome email sent" message={done || ''} tone="success" onClose={() => setDone(null)} />
    </>
  );
}
