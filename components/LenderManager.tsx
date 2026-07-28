'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createLender, updateLender, setLenderActive } from '@/lib/actions';
import { Modal, ConfirmDialog, AlertDialog } from '@/components/Modal';

export interface LenderRow { id: string; name: string; active: boolean; loan_count: number }

export default function LenderManager({ lenders }: { lenders: LenderRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<LenderRow | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmOff, setConfirmOff] = useState<LenderRow | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const visible = lenders.filter(l => showInactive || l.active);

  async function add() {
    if (!newName.trim()) { setErr('Lender name is required.'); return; }
    setBusy(true); setErr('');
    const res = await createLender(newName);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not add the lender.'); return; }
    setAddOpen(false); setNewName(''); setNote(res.message || 'Lender added.');
    router.refresh();
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editName.trim()) { setErr('Lender name is required.'); return; }
    setBusy(true); setErr('');
    const res = await updateLender(editing.id, editName);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Could not update the lender.'); return; }
    setEditing(null); setNote(res.message || 'Lender updated.');
    router.refresh();
  }

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
        <button className="btn" onClick={() => { setErr(''); setAddOpen(true); }}>Add lender</button>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      <table className="bordered">
        <thead>
          <tr><th>Lender</th><th className="num">Loans</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {visible.map(l => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td className="num">{l.loan_count}</td>
              <td><span className={`badge ${l.active ? 'staff' : 'borrower'}`}>{l.active ? 'active' : 'inactive'}</span></td>
              <td>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn secondary" disabled={busy}
                    onClick={() => { setEditing(l); setEditName(l.name); setErr(''); }}>Edit</button>
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
            <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>No lenders yet.</td></tr>
          )}
        </tbody>
      </table>

      <Modal open={addOpen} onClose={() => !busy && setAddOpen(false)} title="Add Lender">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-wrap">
            <label>Lender name</label>
            <input className="field" value={newName} onChange={e => setNewName(e.target.value)} />
          </div>
          {err && <div className="alert error" style={{ margin: 0 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn secondary" disabled={busy} onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn" disabled={busy} onClick={add}>{busy ? 'Adding\u2026' : 'Add lender'}</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => !busy && setEditing(null)} title="Edit Lender">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field-wrap">
            <label>Lender name</label>
            <input className="field" value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
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
