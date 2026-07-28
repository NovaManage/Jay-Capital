'use client';

import { useState, useRef, useEffect } from 'react';
import { firstOfMonth, monthName, statementMonths } from '@/lib/format';
import { emailStatement } from '@/lib/email';
import { AlertDialog } from '@/components/Modal';

/**
 * Admin/staff control to email the borrower one or more monthly statements.
 * Months come from a multi-select dropdown (closing month .. next month).
 */
export default function EmailStatementControls({
  loanId, closingDate, borrowerEmail,
}: { loanId: string; closingDate: string; borrowerEmail: string | null }) {
  const months = statementMonths(closingDate);          // newest-first
  const defaultMonth = months.includes(firstOfMonth(new Date())) ? firstOfMonth(new Date()) : months[0];
  const [selected, setSelected] = useState<string[]>([defaultMonth]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<{ msg: string; tone: 'info' | 'error' | 'success' } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function toggle(m: string) {
    setSelected(s => s.includes(m) ? s.filter(x => x !== m) : [...s, m]);
  }

  async function send() {
    setBusy(true);
    try {
      const res = await emailStatement(loanId, selected);
      setAlert({ msg: `Sent ${res.count} statement${res.count > 1 ? 's' : ''} to ${res.to}.`, tone: 'success' });
    } catch (e: any) {
      setAlert({ msg: e.message, tone: 'error' });
    }
    setBusy(false);
  }

  if (!borrowerEmail) {
    return <p className="muted">Add a borrower email to enable sending statements.</p>;
  }

  const label = selected.length === 0 ? 'Select months'
    : selected.length === 1 ? monthName(selected[0])
    : `${selected.length} months selected`;

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Select which month(s) to email to <b>{borrowerEmail}</b>. Each month is attached as its own PDF.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div ref={ref} style={{ position: 'relative' }}>
          <button type="button" className="btn secondary" onClick={() => setOpen(o => !o)} style={{ minWidth: 200, textAlign: 'left' }}>
            {label} &nbsp;&#9662;
          </button>
          {open && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, zIndex: 50, background: '#fff',
              border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(31,56,100,.18)',
              maxHeight: 260, overflowY: 'auto', minWidth: 220, padding: 6,
            }}>
              {months.map(m => (
                <label key={m} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', borderRadius: 6, cursor: 'pointer' }}
                  onMouseDown={e => e.preventDefault()}>
                  <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)} />
                  {monthName(m)}
                </label>
              ))}
            </div>
          )}
        </div>

        <button className="btn" disabled={busy || selected.length === 0} onClick={send}>
          {busy ? 'Sending\u2026' : `Email ${selected.length} statement${selected.length === 1 ? '' : 's'}`}
        </button>
      </div>

      <AlertDialog
        open={!!alert}
        title={alert?.tone === 'error' ? 'Could not send' : 'Statements sent'}
        message={alert?.msg || ''}
        tone={alert?.tone || 'info'}
        onClose={() => setAlert(null)}
      />
    </div>
  );
}
