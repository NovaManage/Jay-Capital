'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDraw, updateDraw } from '@/lib/actions';
import { Modal, AlertDialog } from '@/components/Modal';

/**
 * "Add draw" button that opens a popup with only Date + Amount.
 * Description is always saved as "Construction Draw".
 */
export default function AddDrawModal({
  loanId, editing,
}: {
  loanId: string;
  editing?: { id: string; draw_date: string; amount: number; description: string } | null;
}) {
  const router = useRouter();
  const isEdit = !!editing;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(editing?.draw_date ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [err, setErr] = useState('');

  async function submit() {
    if (!date || !amount) { setErr('Please enter both a date and an amount.'); return; }
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.set('draw_date', date);
      fd.set('amount', amount);
      fd.set('description', editing?.description || 'Construction Draw');

      const res = isEdit
        ? await updateDraw(loanId, editing!.id, fd)
        : await addDraw(loanId, fd);

      if (!res.ok) { setErr(res.error || 'Could not save the draw.'); setBusy(false); return; }

      setOpen(false);
      if (!isEdit) { setDate(''); setAmount(''); }
      router.refresh();
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  return (
    <>
      <button className={isEdit ? 'btn secondary' : 'btn'} onClick={() => { setErr(''); setOpen(true); }}>
        {isEdit ? 'Edit' : 'Add draw'}
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={isEdit ? 'Edit Construction Draw' : 'Add Construction Draw'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-wrap">
            <label>Date</label>
            <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="field-wrap">
            <label>Amount</label>
            <input className="field" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Saving…' : isEdit ? 'Save draw' : 'Add draw'}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
