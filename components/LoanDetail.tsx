'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money, pct, fmtDate, firstOfMonth, monthName, clampMonth, statementMonths } from '@/lib/format';
import { buildStatement, drawInterest, type Draw as EngineDraw } from '@/lib/interest';
import { deleteDraw, setLoanStatus, deleteLoan, deletePayment } from '@/lib/actions';
import { buildLedger, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import AddPaymentModal from '@/components/AddPaymentModal';
import EmailStatementControls from '@/components/EmailStatementControls';
import AddDrawModal from '@/components/AddDrawModal';
import AddBorrowerModal from '@/components/AddBorrowerModal';
import SendPortalLinkModal from '@/components/SendPortalLinkModal';
import { ConfirmDialog, AlertDialog } from '@/components/Modal';
import LoanPager from '@/components/LoanPager';

interface Summary {
  loan_id: string; loan_number: string; property: string; loan_amount: number;
  acquisition: number; construction: number; annual_rate: number; closing_date: string;
  status: string; access_token: string; borrower_id: string; borrower_name: string;
  is_entity?: boolean | null; entity_name?: string | null;
  borrower_email: string | null; borrower_phone: string | null; lender_name: string | null;
  total_disbursed: number; remaining_draw: number; accrued_interest: number;
}
interface DrawRow { id: string; draw_date: string; description: string; amount: number; interest_accrued: number | null; }

export default function LoanDetail({
  summary, draws, payments = [], allocations = [], canEdit, canSend, fallbackOrder = [],
}: {
  summary: Summary; draws: DrawRow[];
  payments?: PaymentRow[]; allocations?: AllocationRow[];
  canEdit: boolean; canSend: boolean;
  fallbackOrder?: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const rate = Number(summary.annual_rate);
  const [stmtDate, setStmtDate] = useState(() => clampMonth(firstOfMonth(new Date(), 1), summary.closing_date));
  const months = statementMonths(summary.closing_date);

  const [confirmDeleteLoan, setConfirmDeleteLoan] = useState(false);
  const [confirmDeleteDraw, setConfirmDeleteDraw] = useState<string | null>(null);
  const [confirmDeletePayment, setConfirmDeletePayment] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const engineLoan = {
    loan_amount: Number(summary.loan_amount), acquisition: Number(summary.acquisition),
    annual_rate: rate, closing_date: summary.closing_date,
  };
  const engineDraws: EngineDraw[] = draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));
  const stmt = buildStatement(engineLoan, engineDraws, stmtDate);
  const ledger = buildLedger(engineLoan, engineDraws, payments, allocations, stmtDate);

  const statementUrl = typeof window !== 'undefined' ? `${window.location.origin}/statement/${summary.access_token}` : '';
  const pdfHref = `/api/statement-pdf/${summary.access_token}?month=${stmtDate}`;
  const go = (delta: number) => setStmtDate(cur => clampMonth(firstOfMonth(cur, delta), summary.closing_date));

  async function doDeleteLoan() {
    setConfirmDeleteLoan(false);
    setBusy(true);
    const res = await deleteLoan(summary.loan_id);
    if (!res.ok) { setActionError(res.error || 'Could not delete the loan.'); setBusy(false); return; }
    router.push('/admin');
    router.refresh();
  }
  async function doDeleteDraw(id: string) {
    setConfirmDeleteDraw(null);
    setBusy(true);
    const res = await deleteDraw(summary.loan_id, id);
    setBusy(false);
    if (!res.ok) { setActionError(res.error || 'Could not delete the draw.'); return; }
    router.refresh();
  }

  const construction = draws.filter(d => d.description === 'Construction Draw');

  return (
    <div className="wrap">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, flexWrap: 'wrap', marginBottom: 12,
      }}>
        <Link href="/admin">&larr; Back to Dashboard</Link>
        <LoanPager currentId={summary.loan_id} fallbackOrder={fallbackOrder} />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ color: 'var(--navy)', margin: '0 0 4px' }}>
              {summary.is_entity && summary.entity_name ? summary.entity_name : summary.borrower_name}
            </h1>
            {summary.is_entity && summary.entity_name && (
              <div className="muted" style={{ marginBottom: 2 }}>
                Personal name: <b>{summary.borrower_name}</b>
                <span style={{ marginLeft: 8 }} className="badge staff">entity</span>
              </div>
            )}
            <div className="muted">{summary.loan_number} &middot; {summary.property}</div>
            {summary.borrower_email && <div className="muted">{summary.borrower_email}</div>}
            {summary.borrower_phone && <div className="muted">{summary.borrower_phone}</div>}
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <span className={`badge ${summary.status === 'active' ? 'staff' : 'borrower'}`}>{summary.status.replace('_', ' ')}</span>
            {canEdit && (
              <>
                <select className="filter" defaultValue={summary.status} disabled={busy}
                  onChange={async e => {
                    setBusy(true);
                    const res = await setLoanStatus(summary.loan_id, e.target.value);
                    setBusy(false);
                    if (!res.ok) { setActionError(res.error || 'Could not change the status.'); return; }
                    router.refresh();
                  }}>
                  <option value="active">Active</option>
                  <option value="paid_off">Paid off</option>
                  <option value="defaulted">Defaulted</option>
                </select>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Link className="btn secondary" href={`/admin/loans/${summary.loan_id}/edit`}>Edit</Link>
                  <button className="btn danger" disabled={busy} onClick={() => setConfirmDeleteLoan(true)}>Delete loan</button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="summary" style={{ marginTop: 20 }}>
          <div className="row"><span className="k">Loan Amount</span><span className="v">{money(summary.loan_amount)}</span></div>
          <div className="row"><span className="k">Total Disbursed</span><span className="v">{money(summary.total_disbursed)}</span></div>
          <div className="row"><span className="k">Acquisition</span><span className="v">{money(summary.acquisition)}</span></div>
          <div className="row"><span className="k">Remaining Draw</span><span className="v">{money(summary.remaining_draw)}</span></div>
          <div className="row"><span className="k">Construction Budget</span><span className="v">{money(summary.construction)}</span></div>
          <div className="row"><span className="k">Total Draw</span><span className="v">{money(Number(summary.total_disbursed) - Number(summary.acquisition))}</span></div>
          <div className="row"><span className="k">Interest Rate</span><span className="v">{pct(summary.annual_rate)}</span></div>
          <div className="row"><span className="k">Closing Date</span><span className="v">{fmtDate(summary.closing_date)}</span></div>
          <div className="row"><span className="k">Lender</span><span className="v">{summary.lender_name ?? ''}</span></div>
        </div>

        {statementUrl && (
          <div className="alert info" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ wordBreak: 'break-all' }}>Borrower link: <a href={statementUrl} target="_blank">{statementUrl}</a></span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn secondary" onClick={() => { navigator.clipboard.writeText(statementUrl); setCopied(true); }}>Copy</button>
              {canSend && <SendPortalLinkModal loanId={summary.loan_id} borrowerEmail={summary.borrower_email} />}
              {canEdit && <AddBorrowerModal loanId={summary.loan_id} borrowerId={summary.borrower_id} borrowerName={summary.borrower_name} borrowerEmail={summary.borrower_email} />}
            </div>
          </div>
        )}
      </div>

      {/* Statement preview with clamped month navigation */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ color: 'var(--navy)', margin: 0 }}>Statement Preview</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn secondary" onClick={() => go(-1)}>&larr; Prev</button>
            <select className="filter" value={stmtDate} onChange={e => setStmtDate(e.target.value)}>
              {months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
            <button className="btn secondary" onClick={() => go(1)}>Next &rarr;</button>
            <a className="btn" href={pdfHref} target="_blank" rel="noopener">Download PDF</a>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Statement date {fmtDate(stmtDate)}{stmt.prepaidAtClosing ? ' · closing month, interest prepaid at closing' : ''}</p>
        <div className="summary">
          <div className="row"><span className="k">Total disbursed (as of period)</span><span className="v">{money(stmt.totalDisbursed)}</span></div>
          <div className="row"><span className="k">Total draws this period</span><span className="v">{money(stmt.periodDrawTotal)}</span></div>
          <div className="row"><span className="k">Base balance interest</span><span className="v">{money(stmt.baseInterest)}</span></div>
          <div className="row"><span className="k">Interest accrued this period</span><span className="v">{money(stmt.periodDrawInterest)}</span></div>
          <div className="row"><span className="k">Previous balance</span><span className="v">{money(ledger.previousBalance)}</span></div>
          <div className="row"><span className="k">Payments received</span><span className="v">{ledger.paymentsThisPeriod > 0 ? `(${money(ledger.paymentsThisPeriod)})` : money(0)}</span></div>
          <div className="row"><span className="k">Current charges</span><span className="v">{money(ledger.currentCharge)}</span></div>
          <div className="row due"><span className="k">Amount Due</span><span className="v">{money(ledger.amountDue)}</span></div>
        </div>
        {ledger.priorUnpaid.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Past due: {ledger.priorUnpaid.map(r => `${fmtDate(r.statementDate)} ${money(r.balance)}`).join(' · ')}
          </p>
        )}
        {ledger.unapplied > 0.005 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            {money(ledger.unapplied)} in payments has not been applied to a specific month yet.
          </p>
        )}
      </div>

      {/* Payments */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ color: 'var(--navy)', marginTop: 0, marginBottom: 0 }}>Payments</h2>
          {canEdit && (
            <AddPaymentModal
              loanId={summary.loan_id} loan={engineLoan} draws={engineDraws}
              payments={payments} allocations={allocations}
            />
          )}
        </div>
        <div className="tablescroll" style={{ marginTop: 12 }}>
          <table className="bordered">
            <thead><tr><th>Date</th><th>Method</th><th>Note</th><th>Applied To</th><th className="num">Amount</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {payments.map(p => {
                const mine = allocations.filter(a => a.payment_id === p.id);
                return (
                  <tr key={p.id}>
                    <td>{fmtDate(p.payment_date)}</td>
                    <td>{p.method || ''}</td>
                    <td>{p.note || ''}</td>
                    <td>{mine.length ? mine.map(a => `${monthName(a.period_month)} ${money(a.amount)}`).join(', ') : <span className="muted">unapplied</span>}</td>
                    <td className="num">{money(p.amount)}</td>
                    {canEdit && (
                      <td className="num">
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <AddPaymentModal
                            key={`edit-${p.id}`}
                            loanId={summary.loan_id} loan={engineLoan} draws={engineDraws}
                            payments={payments} allocations={allocations} editing={p}
                          />
                          <button className="btn danger" disabled={busy}
                            onClick={() => setConfirmDeletePayment(p.id)}>Delete</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {payments.length === 0 && <tr><td colSpan={canEdit ? 6 : 5} className="muted" style={{ textAlign: 'center' }}>No payments recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Email statement to borrower (admin + staff) */}
      {canSend && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Email Statement to Borrower</h2>
          <EmailStatementControls loanId={summary.loan_id} closingDate={summary.closing_date} borrowerEmail={summary.borrower_email} />
        </div>
      )}

      {/* Draws */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ color: 'var(--navy)', marginTop: 0, marginBottom: 0 }}>Construction Draws</h2>
          {canEdit && <AddDrawModal loanId={summary.loan_id} />}
        </div>
        <div className="tablescroll" style={{ marginTop: 12 }}>
          <table className="bordered">
            <thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th><th className="num">Interest Accrued</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {construction.map(d => (
                <tr key={d.id}>
                  <td>{fmtDate(d.draw_date)}</td>
                  <td>{d.description}</td>
                  <td className="num">{money(d.amount)}</td>
                  <td className="num">{money(drawInterest(Number(d.amount), rate, d.draw_date))}</td>
                  {canEdit && (
                    <td className="num">
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <AddDrawModal loanId={summary.loan_id} editing={d} />
                        <button className="btn danger" disabled={busy}
                          onClick={() => setConfirmDeleteDraw(d.id)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {construction.length === 0 && <tr><td colSpan={canEdit ? 5 : 4} className="muted" style={{ textAlign: 'center' }}>No draws yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteLoan}
        title="Delete loan"
        message={`Delete loan ${summary.loan_number} for ${summary.borrower_name}? This permanently removes the loan and all of its draws.`}
        confirmLabel="Delete loan" danger
        onConfirm={doDeleteLoan} onCancel={() => setConfirmDeleteLoan(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteDraw}
        title="Delete draw"
        message="Delete this construction draw? This cannot be undone."
        confirmLabel="Delete draw" danger
        onConfirm={() => confirmDeleteDraw && doDeleteDraw(confirmDeleteDraw)}
        onCancel={() => setConfirmDeleteDraw(null)}
      />
      <ConfirmDialog
        open={!!confirmDeletePayment}
        title="Delete payment"
        message="Remove this payment? Anything it was applied to becomes outstanding again."
        confirmLabel="Delete payment" danger
        onConfirm={async () => {
          const id = confirmDeletePayment; setConfirmDeletePayment(null);
          if (!id) return;
          setBusy(true);
          const res = await deletePayment(summary.loan_id, id);
          setBusy(false);
          if (!res.ok) { setActionError(res.error || 'Could not delete the payment.'); return; }
          router.refresh();
        }}
        onCancel={() => setConfirmDeletePayment(null)}
      />
      <AlertDialog open={copied} title="Copied" message="Borrower link copied to clipboard." tone="success" onClose={() => setCopied(false)} />
      <AlertDialog
        open={!!actionError}
        title="That didn't work"
        message={actionError || ''}
        tone="error"
        onClose={() => setActionError(null)}
      />
    </div>
  );
}
