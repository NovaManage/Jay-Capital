import { buildStatement, drawInterest, type Draw as EngineDraw } from '@/lib/interest';
import { money, pct, fmtDate, statementPeriod } from '@/lib/format';

export interface StatementLoan {
  loan_number: string; property: string; loan_amount: number; acquisition: number;
  construction: number; annual_rate: number; closing_date: string;
  borrower_name: string; borrower_email: string | null; borrower_phone: string | null;
  lender_name: string | null;
}
export interface StatementDraw { draw_date: string; description: string; amount: number; interest_accrued: number | null; }

/**
 * Canonical statement markup, used for BOTH the on-screen statement and the
 * downloaded PDF, so the two always match. Inline styles only (also safe for
 * email). Navy theme to match the app.
 *
 * `fullPage` wraps the card in a full <html> document (for PDF/print/email).
 * When false, only the inner card is returned (for embedding in a React page).
 */
export function statementHTML(
  loan: StatementLoan, draws: StatementDraw[], statementDate: string, fullPage = true,
): string {
  const engineDraws: EngineDraw[] = draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));
  const rate = Number(loan.annual_rate);
  const stmt = buildStatement(
    { loan_amount: Number(loan.loan_amount), acquisition: Number(loan.acquisition), annual_rate: rate, closing_date: loan.closing_date },
    engineDraws, statementDate
  );
  const period = statementPeriod(String(statementDate).slice(0, 10));

  const navy = '#1F3864', navyMed = '#2E4B7A', soft = '#D9E1F2', pale = '#EEF2F9', muted = '#6B7A90';
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;border-bottom:1px solid ${soft};font-weight:700;color:${navy}">${k}</td>` +
    `<td style="padding:7px 0;border-bottom:1px solid ${soft};text-align:right">${v}</td></tr>`;

  // Full draw table SINCE CLOSING; each row shows that draw's own first-month interest.
  const construction = draws.filter(d => d.description === 'Construction Draw');
  const drawRows = construction.length
    ? construction.map(d => {
        const int = drawInterest(Number(d.amount), rate, d.draw_date);
        return `<tr><td style="padding:9px 10px;border-bottom:1px solid #EDF1F8">${fmtDate(d.draw_date)}</td>` +
        `<td style="padding:9px 10px;border-bottom:1px solid #EDF1F8">${d.description}</td>` +
        `<td style="padding:9px 10px;border-bottom:1px solid #EDF1F8;text-align:right">${money(d.amount)}</td>` +
        `<td style="padding:9px 10px;border-bottom:1px solid #EDF1F8;text-align:right">${money(int)}</td></tr>`;
      }).join('')
    : `<tr><td colspan="4" style="padding:12px;color:${muted};text-align:center">No draw activity on file.</td></tr>`;

  const card = `<div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
    <h1 style="color:${navy};font-size:22px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;text-align:center;margin:0 0 6px">Loan Statement</h1>
    <div style="height:3px;background:${navy};border-radius:2px;margin:12px 0 22px"></div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px"><tr>
      <td style="vertical-align:top">
        <div style="color:${navy};font-weight:700;font-size:16px">${loan.borrower_name}</div>
        <div style="color:${muted}">${loan.property}</div>
        ${loan.borrower_phone ? `<div style="color:${muted}">${loan.borrower_phone}</div>` : ''}
        ${loan.borrower_email ? `<div style="color:${muted}">${loan.borrower_email}</div>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right">
        <div style="color:${muted}">Statement Date</div>
        <div style="font-weight:700;color:${navy}">${fmtDate(statementDate)}</div>
        <div style="color:${muted};margin-top:6px">Period: ${period.label}</div>
      </td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      ${row('Loan Amount', money(loan.loan_amount))}
      ${row('Total Disbursed', money(stmt.totalDisbursed))}
      ${row('Acquisition', money(loan.acquisition))}
      ${row('Remaining Draw Balance', money(stmt.remainingDraw))}
      ${row('Construction Budget', money(loan.construction))}
      ${row('Interest Rate', pct(loan.annual_rate))}
      ${row('Closing Date', fmtDate(loan.closing_date))}
      ${row('Lender', loan.lender_name || '')}
    </table>
    <table style="width:100%;border-collapse:collapse;margin:2px 0 6px">
      ${row('Base Balance Interest', money(stmt.baseInterest))}
      ${row('Draw Interest (this period)', money(stmt.periodDrawInterest))}
    </table>
    <table style="width:100%;border-collapse:collapse;margin:6px 0 22px">
      <tr><td style="padding:12px;background:${pale};border-radius:6px;font-weight:800;font-size:16px;color:${navy}">Amount Due</td>
      <td style="padding:12px;background:${pale};border-radius:6px;font-weight:800;font-size:16px;color:${navy};text-align:right">${money(stmt.amountDue)}</td></tr>
    </table>
    <div style="color:${navy};font-weight:700;margin:0 0 8px">Construction Draws (since closing)</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid ${soft};border-radius:8px;overflow:hidden">
      <thead><tr>
        <th style="background:${navyMed};color:#fff;text-align:left;padding:10px;font-size:12px;text-transform:uppercase">Date</th>
        <th style="background:${navyMed};color:#fff;text-align:left;padding:10px;font-size:12px;text-transform:uppercase">Description</th>
        <th style="background:${navyMed};color:#fff;text-align:right;padding:10px;font-size:12px;text-transform:uppercase">Amount</th>
        <th style="background:${navyMed};color:#fff;text-align:right;padding:10px;font-size:12px;text-transform:uppercase">Interest Accrued</th>
      </tr></thead>
      <tbody>${drawRows}</tbody>
    </table>
    <p style="color:${muted};font-size:12px;margin-top:24px">Questions about this statement? Reply directly to the email this was sent from.</p>
  </div>`;

  if (!fullPage) return card;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Loan Statement</title></head>
  <body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">${card}</body></html>`;
}
