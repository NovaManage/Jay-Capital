'use client';

import { useState } from 'react';
import { money, pct, fmtDate, firstOfMonth, monthName, clampMonth, statementMonths, statementPeriod } from '@/lib/format';
import { buildStatement, drawInterest, type Draw as EngineDraw } from '@/lib/interest';

export interface StatementData {
  loan_id?: string;
  loan_number: string; property: string; loan_amount: number; acquisition: number;
  construction: number; annual_rate: number; closing_date: string;
  borrower_name: string; borrower_email: string | null; borrower_phone: string | null;
  lender_name: string | null; total_disbursed: number; remaining_draw: number;
  accrued_interest: number; access_token: string;
}
export interface StatementDraw { draw_date: string; description: string; amount: number; interest_accrued: number | null; }

export default function StatementView({
  loan, draws, allowNavigate = true,
}: { loan: StatementData; draws: StatementDraw[]; allowNavigate?: boolean }) {
  const months = statementMonths(loan.closing_date);        // newest-first, closing..next month
  const [asOf, setAsOf] = useState(() => clampMonth(firstOfMonth(new Date()), loan.closing_date));

  const rate = Number(loan.annual_rate);
  const engineDraws: EngineDraw[] = draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));
  const stmt = buildStatement(
    { loan_amount: Number(loan.loan_amount), acquisition: Number(loan.acquisition), annual_rate: rate, closing_date: loan.closing_date },
    engineDraws, asOf
  );
  const period = statementPeriod(asOf);
  const pdfHref = `/api/statement-pdf/${loan.access_token}?month=${asOf}`;

  // clamp Prev/Next so we can never jump outside the valid list
  const go = (delta: number) => setAsOf(cur => clampMonth(firstOfMonth(cur, delta), loan.closing_date));

  const construction = draws.filter(d => d.description === 'Construction Draw');

  return (
    <div className="wrap" style={{ maxWidth: 960 }}>
      <div className="card">
        <h1 className="title">Loan Statement</h1>
        <div className="rule" />

        {allowNavigate && (
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn secondary" onClick={() => go(-1)}>&larr; Prev</button>
              <select className="filter" value={asOf} onChange={e => setAsOf(e.target.value)}>
                {months.map(m => (
                  <option key={m} value={m}>{monthName(m)}</option>
                ))}
              </select>
              <button className="btn secondary" onClick={() => go(1)}>Next &rarr;</button>
            </div>
            <a className="btn" href={pdfHref} target="_blank" rel="noopener">Download PDF</a>
          </div>
        )}

        <div className="contact">
          <div>
            <div className="name">{loan.borrower_name}</div>
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

        <div className="summary">
          <div className="row"><span className="k">Loan Amount</span><span className="v">{money(loan.loan_amount)}</span></div>
          <div className="row"><span className="k">Total Disbursed</span><span className="v">{money(stmt.totalDisbursed)}</span></div>
          <div className="row"><span className="k">Acquisition</span><span className="v">{money(loan.acquisition)}</span></div>
          <div className="row"><span className="k">Remaining Draw Balance</span><span className="v">{money(stmt.remainingDraw)}</span></div>
          <div className="row"><span className="k">Construction Budget</span><span className="v">{money(loan.construction)}</span></div>
          <div className="row"><span className="k">Interest Rate</span><span className="v">{pct(loan.annual_rate)}</span></div>
          <div className="row"><span className="k">Closing Date</span><span className="v">{fmtDate(loan.closing_date)}</span></div>
          <div className="row"><span className="k">Lender</span><span className="v">{loan.lender_name ?? ''}</span></div>
          <div className="row"><span className="k">Base Balance Interest</span><span className="v">{money(stmt.baseInterest)}</span></div>
          <div className="row"><span className="k">Draw Interest (this period)</span><span className="v">{money(stmt.periodDrawInterest)}</span></div>
          <div className="row due"><span className="k">Amount Due</span><span className="v">{money(stmt.amountDue)}</span></div>
        </div>

        <div style={{ color: 'var(--navy)', fontWeight: 700, margin: '8px 0' }}>Construction Draws (since closing)</div>
        {construction.length > 0 ? (
          <table className="bordered" style={{ marginTop: 4 }}>
            <thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th><th className="num">Interest Accrued</th></tr></thead>
            <tbody>
              {construction.map((d, i) => (
                <tr key={i}>
                  <td>{fmtDate(d.draw_date)}</td>
                  <td>{d.description}</td>
                  <td className="num">{money(d.amount)}</td>
                  <td className="num">{money(drawInterest(Number(d.amount), rate, d.draw_date))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No draw activity on file for this loan.</p>}

        <p className="muted" style={{ marginTop: 28, fontSize: 12 }}>
          Questions about this statement? Reply to the email this link was sent from.
        </p>
      </div>
    </div>
  );
}
