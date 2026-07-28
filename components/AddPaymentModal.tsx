'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPayment } from '@/lib/actions';
import { Modal } from '@/components/Modal';
import { money, firstOfMonth } from '@/lib/format';
import { openCharges, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import type { Loan as EngineLoan, Draw as EngineDraw } from '@/lib/interest';

/**
 * Record a payment and choose which monthly charges it settles.
 * Opens with the amount spread oldest-first across whatever is still open,
 * which is what happens in practice; every line stays editable.
 */
export default function AddPaymentModal({
  loanId, loan, draws, payments, allocations,
}: {
  loanId: string; loan: EngineLoan; draws: EngineDraw[];
  payments: PaymentRow[]; allocations: AllocationRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  const charges = useMemo(
    () => openCharges(loan, draws, payments, allocations, firstOfMonth(new Date(), -1)),
    [loan, draws, payments, allocations]
  );

  const allocTotal = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const paid = Number(amount) || 0;
  const unapplied = paid - allocTotal;

  /** Spread the entered amount across open charges, oldest first. */
  function autoApply(total: number) {
    let left = total;
    const next: Record<string, string> = {};
    for (const c of charges) {
      if (left <= 0.005) break;
      const take = Math.min(left, c.balance);
      next[c.periodMonth] = take.toFixed(2);
      left -= take;
    }
    setAlloc(next);
  }

  async function submit() {
    if (!date) { setErr('Please enter the payment date.'); return; }
    if (!(paid > 0)) { setErr('Please enter a payment amount.'); return; }
    if (allocTotal - paid > 0.005) { setErr('The amounts applied add up to more than the payment.'); return; }

    setBusy(true); setErr('');
    const res = await addPayment(loanId, {
      paymentDate: date, amount: paid, method, note,
      allocations: Object.entries(alloc)
        .map(([periodMonth, v]) => ({ periodMonth, amount: Number(v) || 0 }))
        .filter(a => a.amount > 0),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not record the payment.'); return; }
    setOpen(false);
    setDate(''); setAmount(''); setMethod(''); setNote(''); setAlloc({});
    router.refresh();
  }

  return (
    <>
      <button className="btn" onClick={() => { setErr(''); setOpen(true); }}>Record payment</button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Record Payment" maxWidth={620}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-grid">
            <div className="field-wrap">
              <label>Payment date</label>
              <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="field-wrap">
              <label>Amount</label>
              <input className="field" type="number" step="0.01" value={amount} placeholder="0.00"
                onChange={e => { setAmount(e.target.value); autoApply(Number(e.target.value) || 0); }} />
            </div>
            <div className="field-wrap">
              <label>Method</label>
              <input className="field" value={method} onChange={e => setMethod(e.target.value)} placeholder="Wire, QuickPay, check\u2026" />
            </div>
            <div className="field-wrap">
              <label>Note</label>
              <input className="field" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div>
            <div style={{ color: 'var(--navy)', fontWeight: 700, marginBottom: 8 }}>Apply to charges</div>
            {charges.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>Nothing is currently outstanding on this loan.</p>
            ) : (
              <table className="bordered">
                <thead><tr><th>Statement Month</th><th className="num">Charged</th><th className="num">Open</th><th className="num">Apply</th></tr></thead>
                <tbody>
                  {charges.map(c => (
                    <tr key={c.periodMonth}>
                      <td>{c.label}</td>
                      <td className="num">{money(c.charge)}</td>
                      <td className="num">{money(c.balance)}</td>
                      <td className="num">
                        <input
                          className="field" type="number" step="0.01" style={{ maxWidth: 120, textAlign: 'right' }}
                          value={alloc[c.periodMonth] ?? ''}
                          onChange={e => setAlloc(a => ({ ...a, [c.periodMonth]: e.target.value }))}
                          placeholder="0.00"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              Applied: <b>{money(allocTotal)}</b>
              {Math.abs(unapplied) > 0.005 && (
                <> &middot; {unapplied > 0
                  ? <>unapplied: <b>{money(unapplied)}</b> (will sit as a credit)</>
                  : <span style={{ color: 'var(--danger)' }}>over-applied by {money(-unapplied)}</span>}
                </>
              )}
            </p>
          </div>

          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Saving\u2026' : 'Record payment'}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
