'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPayment, updatePayment } from '@/lib/actions';
import { Modal } from '@/components/Modal';
import { money, fmtDate } from '@/lib/format';
import { openCharges, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import type { Loan as EngineLoan, Draw as EngineDraw } from '@/lib/interest';

/**
 * Record a payment and choose which monthly charges it settles.
 * Opens with the amount spread oldest-first across whatever is still open,
 * which is what happens in practice; every line stays editable.
 */
export default function AddPaymentModal({
  loanId, loan, draws, payments, allocations, editing, trigger,
}: {
  loanId: string; loan: EngineLoan; draws: EngineDraw[];
  payments: PaymentRow[]; allocations: AllocationRow[];
  editing?: PaymentRow | null;
  trigger?: string;
}) {
  const router = useRouter();
  const isEdit = !!editing;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(editing?.payment_date ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [method, setMethod] = useState(editing?.method ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    if (editing) {
      for (const a of allocations.filter(x => x.payment_id === editing.id)) {
        seed[a.period_month.slice(0, 8) + '01'] = String(a.amount);
      }
    }
    return seed;
  });
  const [err, setErr] = useState('');

  // When editing, this payment's own allocations must not count against the
  // open balances -- otherwise its charges look already settled.
  const charges = useMemo(() => {
    const others = editing
      ? allocations.filter(a => a.payment_id !== editing.id)
      : allocations;
    return openCharges(loan, draws, payments, others);
  }, [loan, draws, payments, allocations, editing]);

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
    const body = {
      paymentDate: date, amount: paid, method: method || '', note: note || '',
      allocations: Object.entries(alloc)
        .map(([periodMonth, v]) => ({ periodMonth, amount: Number(v) || 0 }))
        .filter(a => a.amount > 0),
    };
    const res = isEdit
      ? await updatePayment(loanId, editing!.id, body)
      : await addPayment(loanId, body);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not save the payment.'); return; }
    setOpen(false);
    if (!isEdit) { setDate(''); setAmount(''); setMethod(''); setNote(''); setAlloc({}); }
    router.refresh();
  }

  return (
    <>
      <button className={isEdit ? 'btn secondary' : 'btn'} onClick={() => { setErr(''); setOpen(true); }}>
        {trigger || (isEdit ? 'Edit' : 'Record payment')}
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={isEdit ? 'Edit Payment' : 'Record Payment'} maxWidth={680}>
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
                <thead><tr><th>Charge Period</th><th>Bills On</th><th className="num">Charged</th><th className="num">Open</th><th className="num">Apply</th></tr></thead>
                <tbody>
                  {charges.map(c => (
                    <tr key={c.periodMonth}>
                      <td>
                        {c.label}
                        {c.inProgress && <span className="muted" style={{ fontSize: 11 }}> &middot; in progress</span>}
                      </td>
                      <td>{fmtDate(c.statementDate)}</td>
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
              A charge appears from the 1st of the month it covers; the &ldquo;in progress&rdquo;
              figure can still move if a draw is added before the month ends.
              <br />Applied: <b>{money(allocTotal)}</b>
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
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Saving\u2026' : isEdit ? 'Save payment' : 'Record payment'}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
