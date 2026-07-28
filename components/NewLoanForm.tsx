'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createLoan } from '@/lib/actions';
import LenderSelect, { type LenderOption } from '@/components/LenderSelect';
import { formatPhone, formatAddress } from '@/lib/formatting';

export default function NewLoanForm({ lenders }: { lenders: LenderOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loanAmount, setLoanAmount] = useState(0);
  const [acquisition, setAcquisition] = useState(0);
  const [phone, setPhone] = useState('');
  const [property, setProperty] = useState('');
  const construction = Math.max(0, loanAmount - acquisition);

  return (
    <div className="wrap">
      <p style={{ marginBottom: 12 }}><Link href="/admin">&larr; Back to Dashboard</Link></p>
      <div className="card" style={{ maxWidth: 820, margin: '0 auto' }}>
        <h1 className="title">New Loan</h1>
        <div className="rule" />
        {error && <div className="alert error">{error}</div>}
        <form action={async (fd) => {
          setBusy(true); setError('');
          try {
            const res = await createLoan(fd);
            if (!res.ok) { setError(res.error || 'Could not create the loan.'); setBusy(false); return; }
            router.push('/admin'); router.refresh();
          } catch (e: any) { setError(e.message); setBusy(false); }
        }}>
          <div className="form-grid">
            <div className="field-wrap"><label>Borrower Name *</label><input className="field" name="borrower_name" required /></div>
            <div className="field-wrap"><label>Borrower Email *</label><input className="field" type="email" name="borrower_email" required /></div>
            <div className="field-wrap">
              <label>Borrower Phone</label>
              <input
                className="field" name="borrower_phone" type="tel" inputMode="tel"
                value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="(555) 123-4567"
              />
            </div>
            <div className="field-wrap" style={{ gridColumn: '1 / -1' }}>
              <label>Property Address (full) *</label>
              <input
                className="field" name="property" required
                value={property}
                onChange={e => setProperty(e.target.value)}
                onBlur={e => setProperty(formatAddress(e.target.value))}
                placeholder="123 Main St, Springfield, IL 62704"
              />
            </div>
            <LenderSelect lenders={lenders} />
            <div className="field-wrap"><label>Loan Amount *</label><input className="field" type="number" step="0.01" name="loan_amount" value={loanAmount || ''} onChange={e => setLoanAmount(Number(e.target.value))} required /></div>
            <div className="field-wrap"><label>Acquisition *</label><input className="field" type="number" step="0.01" name="acquisition" value={acquisition || ''} onChange={e => setAcquisition(Number(e.target.value))} required /></div>
            <div className="field-wrap"><label>Construction (auto)</label><input className="field" type="number" value={construction.toFixed(2)} readOnly style={{ background: 'var(--pale)' }} /></div>
            <div className="field-wrap"><label>Interest Rate (%) *</label><input className="field" type="number" step="0.01" name="annual_rate" placeholder="12" required /></div>
            <div className="field-wrap"><label>Closing Date *</label><input className="field" type="date" name="closing_date" required /></div>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            All fields are required except the borrower&apos;s phone number. Construction is
            calculated as Loan Amount minus Acquisition. Enter the full property address;
            the dashboard shows a shortened version.
          </p>
          <div style={{ marginTop: 12 }}><button className="btn" disabled={busy} type="submit">{busy ? 'Creating...' : 'Create Loan'}</button></div>
        </form>
      </div>
    </div>
  );
}
