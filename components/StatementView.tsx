'use client';

import { useState } from 'react';
import { money, pct, fmtDate, firstOfMonth, monthName, clampMonth, statementMonths, statementPeriod, borrowerDisplayName } from '@/lib/format';
import { drawInterest, buildStatement, type Draw as EngineDraw } from '@/lib/interest';
import { buildLedger, type PaymentRow, type AllocationRow } from '@/lib/ledger';

export const SERVICER = 'Jay Capital Funding';

export interface StatementData {
  loan_id?: string;
  loan_number: string; property: string; loan_amount: number; acquisition: number;
  construction: number; annual_rate: number; closing_date: string;
  borrower_name: string; borrower_email: string | null; borrower_phone: string | null;
  lender_name: string | null; total_disbursed: number; remaining_draw: number;
  accrued_interest: number; access_token: string;
  is_entity?: boolean | null; entity_name?: string | null;
}
export interface StatementDraw { draw_date: string; description: string; amount: number; interest_accrued: number | null; }
export interface PayInfo { method: string | null; instructions: string | null }

export default function StatementView({
  loan, draws, payments = [], allocations = [], payInfo, allowNavigate = true, flushTop = false,
}: {
  loan: StatementData; draws: StatementDraw[];
  payments?: PaymentRow[]; allocations?: AllocationRow[];
  payInfo?: PayInfo | null; allowNavigate?: boolean;
  /** Sit flush under the loan tab strip, as the open pocket of a folder. */
  flushTop?: boolean;
}) {
  const months = statementMonths(loan.closing_date);
  // Default to the statement for the month now in progress: this month's bill
  // went out on the 1st, so what's useful to see is what lands next.
  const [asOf, setAsOf] = useState(() => clampMonth(firstOfMonth(new Date(), 1), loan.closing_date));

  const rate = Number(loan.annual_rate);
  const engineLoan = {
    loan_amount: Number(loan.loan_amount), acquisition: Number(loan.acquisition),
    annual_rate: rate, closing_date: loan.closing_date,
  };
  const engineDraws: EngineDraw[] = draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));

  const stmt = buildStatement(engineLoan, engineDraws, asOf);
  const ledger = buildLedger(engineLoan, engineDraws, payments, allocations, asOf);
  const period = statementPeriod(asOf);
  const shortPeriod = stmt.periodEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const pdfHref = `/api/statement-pdf/${loan.access_token}?month=${asOf}`;

  const go = (delta: number) => setAsOf(cur => clampMonth(firstOfMonth(cur, delta), loan.closing_date));

  // statementMonths is newest-first, so [0] is the latest month available and
  // the last entry is the earliest. Grey the arrows out at each end rather
  // than leaving a live button that silently does nothing.
  const atNewest = asOf >= months[0];
  const atOldest = asOf <= months[months.length - 1];

  return (
    <div className={`wrap${flushTop ? ' wrap-flush' : ''}`} style={{ maxWidth: 960 }}>
      <div className={`card${flushTop ? ' card-tabbed' : ''}`}>
        <h1 className="title">Loan Statement</h1>
        <div className="rule" />

        {allowNavigate && (
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn secondary" onClick={() => go(-1)} disabled={atOldest}
                title={atOldest ? 'This is the first statement for this loan' : undefined}>
                &larr; Prev
              </button>
              <select className="filter" value={asOf} onChange={e => setAsOf(e.target.value)}>
                {months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
              </select>
              <button className="btn secondary" onClick={() => go(1)} disabled={atNewest}
                title={atNewest ? 'This is the most recent statement' : undefined}>
                Next &rarr;
              </button>
            </div>
            <a className="btn" href={pdfHref} target="_blank" rel="noopener">Download PDF</a>
          </div>
        )}

        <div className="contact">
          <div>
            <div className="name">{borrowerDisplayName(loan)}</div>
            <div className="muted">{loan.property}</div>
            {loan.borrower_phone && <div className="muted">{loan.borrower_phone}</div>}
            {loan.borrower_email && <div className="muted">{loan.borrower_email}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">Statement Date</div>
            <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtDate(asOf)}</div>
            <div className="muted" style={{ marginTop: 6 }}>Period: {period.label}</div>
          </div>
        </div>

        {/* left column: the loan.  right column: this statement's numbers. */}
        <div className="summary">
          <div className="row"><span className="k">Loan Amount</span><span className="v">{money(loan.loan_amount)}</span></div>
          <div className="row"><span className="k">Total Disbursed</span><span className="v">{money(stmt.totalDisbursed)}</span></div>
          <div className="row"><span className="k">Acquisition</span><span className="v">{money(loan.acquisition)}</span></div>
          <div className="row"><span className="k">Remaining Draw Balance</span><span className="v">{money(stmt.remainingDraw)}</span></div>
          <div className="row"><span className="k">Construction Budget</span><span className="v">{money(loan.construction)}</span></div>
          <div className="row"><span className="k">Total Draws {shortPeriod}</span><span className="v">{money(stmt.periodDrawTotal)}</span></div>
          <div className="row"><span className="k">Interest Rate</span><span className="v">{pct(loan.annual_rate)}</span></div>
          <div className="row"><span className="k">Base Balance Interest</span><span className="v">{money(stmt.baseInterest)}</span></div>
          <div className="row"><span className="k">Closing Date</span><span className="v">{fmtDate(loan.closing_date)}</span></div>
          <div className="row"><span className="k">Interest Accrued {shortPeriod}</span><span className="v">{money(stmt.periodDrawInterest)}</span></div>
          <div className="row"><span className="k">Servicer</span><span className="v">{SERVICER}</span></div>
        </div>

        {/* Running balance */}
        {/* Its own bordered panel with a navy header bar -- the same visual
            language as the tables below. As a bare heading over .summary rows
            it read as a continuation of the loan details above. */}
        <div style={{
          marginTop: 36, maxWidth: 460, width: '100%',
          border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
        }}>
          <div style={{
            background: 'var(--navy-med)', color: '#fff', fontWeight: 700,
            fontSize: 12, textTransform: 'uppercase', letterSpacing: '.03em',
            padding: '11px 14px',
          }}>
            Account Activity
          </div>
          <div className="summary" style={{ gridTemplateColumns: '1fr', margin: 0, padding: '6px 14px 14px' }}>
            <div className="row"><span className="k">Previous Balance</span><span className="v">{money(ledger.previousBalance)}</span></div>
            <div className="row"><span className="k">Payments Received</span><span className="v">{ledger.paymentsThisPeriod > 0 ? `(${money(ledger.paymentsThisPeriod)})` : money(0)}</span></div>
            <div className="row"><span className="k">Previous Open Balance</span><span className="v">{money(ledger.previousOpenBalance)}</span></div>
            <div className="row"><span className="k">Current Charges</span><span className="v">{money(ledger.currentCharge)}</span></div>
            <div className="row due"><span className="k">Amount Due</span><span className="v">{money(ledger.amountDue)}</span></div>
          </div>
        </div>

        {ledger.paymentsInPeriod.length > 0 && (
          <>
            <div style={{ color: 'var(--navy)', fontWeight: 700, margin: '28px 0 8px' }}>Payments Received</div>
            <div className="tablescroll narrow"><table className="bordered">
              <thead><tr><th>Date</th><th>Method</th><th>Note</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {ledger.paymentsInPeriod.map(p => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.payment_date)}</td>
                    <td>{p.method || ''}</td>
                    <td>{p.note || ''}</td>
                    <td className="num">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}

        <div style={{ color: 'var(--navy)', fontWeight: 700, margin: '28px 0 8px' }}>Construction Draws ({stmt.periodLabel})</div>
        {stmt.periodDraws.length > 0 ? (
          <div className="tablescroll narrow"><table className="bordered">
            <thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th><th className="num">Interest Accrued</th></tr></thead>
            <tbody>
              {stmt.periodDraws.map((d, i) => (
                <tr key={i}>
                  <td>{fmtDate(d.draw_date)}</td>
                  <td>{d.description}</td>
                  <td className="num">{money(d.amount)}</td>
                  <td className="num">{money(drawInterest(Number(d.amount), rate, d.draw_date))}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2} style={{ fontWeight: 700, color: 'var(--navy)' }}>Total for period</td>
                <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{money(stmt.periodDrawTotal)}</td>
                <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>{money(stmt.periodDrawInterest)}</td>
              </tr>
            </tbody>
          </table></div>
        ) : <p className="muted">No draws during this period.</p>}

        {ledger.priorUnpaid.length > 0 && (
          <>
            <div style={{ color: 'var(--danger)', fontWeight: 700, margin: '28px 0 8px' }}>Unpaid Previous Charges</div>
            <div className="tablescroll narrow"><table className="bordered">
              <thead><tr><th>Statement Date</th><th className="num">Charged</th><th className="num">Paid</th><th className="num">Still Owed</th></tr></thead>
              <tbody>
                {ledger.priorUnpaid.map(r => (
                  <tr key={r.periodMonth}>
                    <td>{fmtDate(r.statementDate)}</td>
                    <td className="num">{money(r.charge)}</td>
                    <td className="num">{money(r.paid)}</td>
                    <td className="num">{money(r.balance)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ fontWeight: 700, color: 'var(--navy)' }}>Total past due</td>
                  <td className="num"></td><td className="num"></td>
                  <td className="num" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                    {money(ledger.priorUnpaid.reduce((s, r) => s + r.balance, 0))}
                  </td>
                </tr>
              </tbody>
            </table></div>
          </>
        )}

        {(payInfo?.instructions || payInfo?.method) && (
          <div style={{ marginTop: 34, background: 'var(--pale)', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ color: 'var(--navy)', fontWeight: 700, marginBottom: 6 }}>
              How to Pay{payInfo.method ? ` — ${payInfo.method}` : ''}
            </div>
            {payInfo.instructions && (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{payInfo.instructions}</div>
            )}
          </div>
        )}

        <p className="muted" style={{ marginTop: 28, fontSize: 12 }}>
          Questions about this statement? Reply to the email this link was sent from.
        </p>
      </div>
    </div>
  );
}
