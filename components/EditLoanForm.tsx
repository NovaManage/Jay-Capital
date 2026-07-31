'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateLoan } from '@/lib/actions';
import { rateFraction } from '@/lib/format';
import LenderSelect, { type LenderOption } from '@/components/LenderSelect';
import EntityFields from '@/components/EntityFields';
import { formatPhone, formatAddress } from '@/lib/formatting';

interface Loan {
  loan_id: string; loan_number: string; property: string; loan_amount: number;
  acquisition: number; construction: number; annual_rate: number; closing_date: string;
  borrower_name: string; borrower_email: string | null; borrower_phone: string | null;
  lender_name: string | null;
  lender_id?: string | null;
  is_entity?: boolean | null;
  entity_name?: string | null;
}

export default function EditLoanForm({ loan, lenders }: { loan: Loan; lenders: LenderOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loanAmount, setLoanAmount] = useState(Number(loan.loan_amount));
  const [acquisition, setAcquisition] = useState(Number(loan.acquisition));
  const [phone, setPhone] = useState(formatPhone(loan.borrower_phone ?? ''));
  const [property, setProperty] = useState(loan.property);
  const construction = Math.max(0, loanAmount - acquisition);

  // annual_rate stored as fraction; show as percent
  const ratePct = (rateFraction(loan.annual_rate) * 100).toString();

  return (
    <div className="wrap">
      <p style={{ marginBottom: 12 }}><Link href={`/admin/loans/${loan.loan_id}`}>&larr; Back to Loan</Link></p>
      <div className="card" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 className="title">Edit Loan</h1>
        <div className="rule" />
        {error && <div className="alert error">{error}</div>}
        <form action={async (fd) => {
          setBusy(true); setError('');
          try {
            const res = await updateLoan(loan.loan_id, fd);
            if (!res.ok) { setError(res.error || 'Could not save the changes.'); setBusy(false); return; }
            router.push(`/admin/loans/${loan.loan_id}`); router.refresh();
          }
          catch (e: any) { setError(e.message); setBusy(false); }
        }}>
          <div className="form-grid">
            <div className="field-wrap"><label>Borrower Name *</label><input className="field" name="borrower_name" defaultValue={loan.borrower_name} required /></div>
            <div className="field-wrap"><label>Borrower Email *</label><input className="field" type="email" name="borrower_email" defaultValue={loan.borrower_email ?? ''} required /></div>
            <div className="field-wrap"><label>Borrower Phone</label><input className="field" name="borrower_phone" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="(555) 123-4567" /></div>
            <div className="field-wrap" style={{ gridColumn: '1 / -1' }}><label>Property Address (full)</label><input className="field" name="property" required value={property} onChange={e => setProperty(e.target.value)} onBlur={e => setProperty(formatAddress(e.target.value))} /></div>
            <EntityFields defaultIsEntity={!!loan.is_entity} defaultEntityName={loan.entity_name ?? ''} />
            <LenderSelect lenders={lenders} currentId={loan.lender_id ?? null} currentName={loan.lender_name} />
            <div className="field-wrap"><label>Loan Amount *</label><input className="field" type="number" step="0.01" name="loan_amount" value={loanAmount} onChange={e => setLoanAmount(Number(e.target.value))} required /></div>
            <div className="field-wrap"><label>Acquisition *</label><input className="field" type="number" step="0.01" name="acquisition" value={acquisition} onChange={e => setAcquisition(Number(e.target.value))} required /></div>
            <div className="field-wrap"><label>Construction (auto)</label><input className="field" type="number" value={construction.toFixed(2)} readOnly style={{ background: 'var(--pale)' }} /></div>
            <div className="field-wrap"><label>Interest Rate (%) *</label><input className="field" type="number" step="0.01" name="annual_rate" defaultValue={ratePct} required /></div>
            <div className="field-wrap"><label>Closing Date *</label><input className="field" type="date" name="closing_date" defaultValue={loan.closing_date} required /></div>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>All fields are required except the borrower&apos;s phone number. Construction is calculated as Loan Amount minus Acquisition.</p>
          <div style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} type="submit">{busy ? 'Saving\u2026' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
