'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StatementView, { type StatementData, type StatementDraw, type PayInfo } from '@/components/StatementView';
import { Modal, AlertDialog } from '@/components/Modal';
import { changeMyEmail } from '@/lib/signup';
import { money, shortAddress } from '@/lib/format';
import type { PaymentRow, AllocationRow } from '@/lib/ledger';

export interface PortalLoan {
  loan: StatementData;
  draws: StatementDraw[];
  payments: PaymentRow[];
  allocations: AllocationRow[];
  payInfo: PayInfo | null;
}

/**
 * The borrower's loans as tabs. With one loan the tab strip is hidden, so a
 * single-loan borrower sees no extra chrome.
 *
 * The selected tab is remembered per user id, so signing back in returns to
 * the loan they were last looking at.
 */
export default function PortalLoans({
  loans, userId, userEmail,
}: { loans: PortalLoan[]; userId: string; userEmail: string }) {
  const router = useRouter();
  const key = `jcf:portal:lastLoan:${userId}`;
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState<string | null>(null);

  // Restore after mount: reading storage during render would not match the
  // server-rendered markup.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const i = loans.findIndex(l => l.loan.loan_id === saved);
        if (i >= 0) setActive(i);
      }
    } catch { /* storage unavailable; first tab is fine */ }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans.length, userId]);

  useEffect(() => {
    if (!ready) return;
    try {
      const id = loans[active]?.loan.loan_id;
      if (id) window.localStorage.setItem(key, id);
    } catch { /* ignore */ }
  }, [active, ready, loans, key]);

  async function saveEmail() {
    if (!newEmail.trim()) { setErr('Please enter an email address.'); return; }
    setBusy(true); setErr('');
    const res = await changeMyEmail(newEmail);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not change your email.'); return; }
    setEmailOpen(false);
    setNote(res.message || 'Your email has been updated.');
    router.refresh();
  }

  const emailControls = (
    <>
      <Modal open={emailOpen} onClose={() => !busy && setEmailOpen(false)} title="Change My Email" maxWidth={480}>
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
            <button className="btn secondary" disabled={busy} onClick={() => setEmailOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={saveEmail}>{busy ? 'Saving…' : 'Save email'}</button>
          </div>
        </div>
      </Modal>
      <AlertDialog open={!!note} title="Account updated" message={note || ''} tone="success" onClose={() => setNote(null)} />
    </>
  );

  if (loans.length === 0) {
    return (
      <>
        <div className="wrap"><div className="card">
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>No loans found</h2>
          <p>
            We couldn&apos;t find any loans registered to <b>{userEmail}</b>.
          </p>
          <p className="muted">
            Loans are matched by the email address on file for them. If your loan was
            registered under a different address, update it below — otherwise contact us
            and we&apos;ll get it sorted.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            <button className="btn" onClick={() => { setErr(''); setNewEmail(''); setEmailOpen(true); }}>
              Change my email
            </button>
            <a className="btn secondary" style={{ textDecoration: 'none' }}
               href="mailto:Yossi@JayCapitalFunding.com?subject=Portal%20access%20help">Email us</a>
            <a className="btn secondary" style={{ textDecoration: 'none' }} href="tel:+18458280731">Call (845) 828-0731</a>
          </div>
        </div></div>
        {emailControls}
      </>
    );
  }

  const current = loans[active] ?? loans[0];
  const multi = loans.length > 1;

  return (
    <>
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: multi ? 14 : 0 }}>
          <button className="btn secondary" onClick={() => { setErr(''); setNewEmail(''); setEmailOpen(true); }}>
            Change my email
          </button>
        </div>

        {multi && (
          <div className="loantabs" role="tablist" aria-label="Your loans">
            {loans.map((l, i) => (
              <button
                key={l.loan.loan_id}
                role="tab"
                aria-selected={i === active}
                className={`loantab ${i === active ? 'active' : ''}`}
                onClick={() => setActive(i)}
              >
                <span className="loantab-addr">{shortAddress(l.loan.property)}</span>
                <span className="loantab-meta">
                  {l.loan.loan_number} · {money(l.loan.loan_amount)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <StatementView
        key={current.loan.loan_id}
        loan={current.loan}
        draws={current.draws}
        payments={current.payments}
        allocations={current.allocations}
        payInfo={current.payInfo}
        flushTop={multi}
      />

      {emailControls}
    </>
  );
}
