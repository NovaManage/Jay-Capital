'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLender, updateLender, setLenderActive } from '@/lib/actions';
import { Modal, ConfirmDialog, AlertDialog } from '@/components/Modal';

export interface LenderRow {
  id: string; name: string; short_name: string | null; active: boolean; loan_count: number;
  payment_method: string | null; payment_instructions: string | null;
}

const BLANK = { name: '', shortName: '', paymentMethod: '', paymentInstructions: '' };

export default function LenderManager({ lenders }: { lenders: LenderRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [editing, setEditing] = useState<LenderRow | null>(null);
  const [confirmOff, setConfirmOff] = useState<LenderRow | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const visible = lenders.filter(l => showInactive || l.active);

  async function add() {
    if (!form.name.trim()) { setErr('Lender name is required.'); return; }
    setBusy(true); setErr('');
    const res = await createLender(form);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not add the lender.'); return; }
    setAddOpen(false); setForm({ ...BLANK }); setNote(res.message || 'Lender added.');
    router.refresh();
  }

  async function saveEdit() {
    if (!editing) return;
    if (!form.name.trim()) { setErr('Lender name is required.'); return; }
    setBusy(true); setErr('');
    const res = await updateLender(editing.id, form);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not update the lender.'); return; }
    setEditing(null); setNote(res.message || 'Lender updated.');
    router.refresh();
  }

  const fields = (
    <>
      <div className="field-wrap">
        <label>Full name *</label>
        <input className="field" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Shown on the loan view" />
      </div>
      <div className="field-wrap">
        <label>Short name</label>
        <input className="field" value={form.shortName}
          onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))}
          placeholder="Shown on the dashboard (defaults to full name)" />
      </div>
      <div className="field-wrap">
        <label>Payment method</label>
        <input className="field" value={form.paymentMethod}
          onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
          placeholder="e.g. Wire transfer, or Zelle QuickPay" />
      </div>
      <div className="field-wrap">
        <label>Payment instructions</label>
        <textarea className="field" rows={5} value={form.paymentInstructions}
          onChange={e => setForm(f => ({ ...f, paymentInstructions: e.target.value }))}
          placeholder={'Wire details or QuickPay address.\nShown to borrowers at the bottom of their statement.'} />
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Borrowers see this text. Statements name the servicer as Jay Capital Funding,
          not the lender, so leave the lender&rsquo;s name out if it should stay private.
        </p>
      </div>
    </>
  );

  async function toggle(l: LenderRow, active: boolean) {
    setConfirmOff(null);
    setBusy(true);
    const res = await setLenderActive(l.id, active);
    setBusy(false);
    setNote(res.ok ? (res.message || 'Updated.') : (res.error || 'Could not update the lender.'));
    router.refresh();
  }

  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={() => { setErr(''); setForm({ ...BLANK }); setAddOpen(true); }}>Add lender</button>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <table className="bordered">
        <thead>
          <tr><th>Lender</th><th>Short name</th><th>Payment method</th><th className="num">Loans</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {visible.map(l => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td>{l.short_name || <span className="muted">&mdash;</span>}</td>
              <td>{l.payment_method || <span className="muted">not set</span>}</td>
              <td className="num">{l.loan_count}</td>
              <td><span className={`badge ${l.active ? 'staff' : 'borrower'}`}>{l.active ? 'active' : 'inactive'}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn secondary" disabled={busy}
                    onClick={() => {
                      setEditing(l);
                      setForm({
                        name: l.name,
                        shortName: l.short_name || '',
                        paymentMethod: l.payment_method || '',
                        paymentInstructions: l.payment_instructions || '',
                      });
                      setErr('');
                    }}>Edit</button>
                  {l.active ? (
                    <button className="btn danger" disabled={busy} onClick={() => setConfirmOff(l)}>Inactivate</button>
                  ) : (
                    <button className="btn" disabled={busy} onClick={() => toggle(l, true)}>Reactivate</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>No lenders yet.</td></tr>
          )}
        </tbody>
      </table>

      <Modal open={addOpen} onClose={() => !busy && setAddOpen(false)} title="Add Lender" maxWidth={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields}
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={add}>{busy ? 'Adding\u2026' : 'Add lender'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => !busy && setEditing(null)} title="Edit Lender" maxWidth={560}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {fields}
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={saveEdit}>{busy ? 'Saving\u2026' : 'Save'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmOff}
        title="Inactivate lender"
        message={confirmOff
          ? `Inactivate ${confirmOff.name}? It stays on the ${confirmOff.loan_count} loan(s) already using it, but won't be offered when creating new loans.`
          : ''}
        confirmLabel="Inactivate" danger
        onConfirm={() => confirmOff && toggle(confirmOff, false)}
        onCancel={() => setConfirmOff(null)}
      />

      <AlertDialog open={!!note} title="Lenders" message={note || ''} tone="success" onClose={() => setNote(null)} />
    </>
  );
}
