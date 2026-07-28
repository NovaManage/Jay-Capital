import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildStatement, drawInterest, type Draw as EngineDraw } from '@/lib/interest';
import { money, pct, fmtDate, statementPeriod } from '@/lib/format';
import { buildLedger, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import type { StatementLoan, StatementDraw } from '@/lib/statement-html';

export const SERVICER = 'Jay Capital Funding';
export interface StatementExtras {
  payments?: PaymentRow[];
  allocations?: AllocationRow[];
  payInfo?: { method: string | null; instructions: string | null } | null;
}

const NAVY = rgb(0x1f / 255, 0x38 / 255, 0x64 / 255);
const NAVY_MED = rgb(0x2e / 255, 0x4b / 255, 0x7a / 255);
const INK = rgb(0.2, 0.2, 0.2);
const MUTED = rgb(0.42, 0.48, 0.56);
const SOFT = rgb(0x85 / 255, 0x9a / 255, 0xc6 / 255);
const PALE = rgb(0xee / 255, 0xf2 / 255, 0xf9 / 255);

/**
 * Statement as a print-ready PDF, laid out to mirror the website loan view:
 * a TWO-COLUMN summary block up top, an Amount Due band, then the draw table.
 *
 * Everything is as of the selected period. Draws dated after the period do
 * not appear and are not counted -- the document is a snapshot of that date,
 * not of today.
 */
export async function statementPDF(
  loan: StatementLoan, draws: StatementDraw[], statementDate: string, extras: StatementExtras = {},
): Promise<Uint8Array> {
  const rate = Number(loan.annual_rate);
  const engineLoan = {
    loan_amount: Number(loan.loan_amount), acquisition: Number(loan.acquisition),
    annual_rate: rate, closing_date: loan.closing_date,
  };
  const engineDraws: EngineDraw[] = draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));
  const stmt = buildStatement(engineLoan, engineDraws, statementDate);
  const ledger = buildLedger(engineLoan, engineDraws, extras.payments ?? [], extras.allocations ?? [], statementDate);
  const period = statementPeriod(String(statementDate).slice(0, 10));
  const shortPeriod = stmt.periodEnd.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  const doc = await PDFDocument.create();
  let page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width } = page.getSize();
  const M = 54;
  let y = 748;

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = INK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const rightText = (s: string, xRight: number, yy: number, size = 10, f = font, color = INK) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y: yy, size, font: f, color });
  };
  const ensure = (need: number) => { if (y - need < 60) { page = doc.addPage([612, 792]); y = 748; } };

  // ---- Title + navy rule
  const title = 'LOAN STATEMENT';
  const tw = bold.widthOfTextAtSize(title, 18);
  text(title, (width - tw) / 2, y, 18, bold, NAVY);
  y -= 12;
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 3, color: NAVY });
  y -= 28;

  // ---- Borrower (full address, wrapped) on the left, date + period on the right
  const topY = y;
  text(loan.borrower_name, M, y, 13, bold, NAVY); y -= 15;
  const words = (loan.property || '').split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(test, 10) > 300 && line) { text(line, M, y, 10, font, MUTED); y -= 13; line = w; }
    else line = test;
  }
  if (line) { text(line, M, y, 10, font, MUTED); y -= 13; }
  if (loan.borrower_phone) { text(loan.borrower_phone, M, y, 10, font, MUTED); y -= 13; }
  if (loan.borrower_email) { text(loan.borrower_email, M, y, 10, font, MUTED); y -= 13; }

  let ry = topY;
  rightText('Statement Date', width - M, ry, 9, font, MUTED); ry -= 14;
  rightText(fmtDate(statementDate), width - M, ry, 11, bold, NAVY); ry -= 16;
  rightText('Period', width - M, ry, 9, font, MUTED); ry -= 12;
  rightText(period.label, width - M, ry, 9, font, INK);

  y = Math.min(y, ry) - 26;

  // ---- TWO-COLUMN summary, mirroring the website loan view
  const GAP = 28;
  const colW = (width - 2 * M - GAP) / 2;
  const leftX = M, leftR = M + colW;
  const rightX = M + colW + GAP, rightR = width - M;

  const leftRows: [string, string][] = [
    ['Loan Amount', money(loan.loan_amount)],
    ['Acquisition', money(loan.acquisition)],
    ['Construction Budget', money(loan.construction)],
    ['Interest Rate', pct(loan.annual_rate)],
    ['Closing Date', fmtDate(loan.closing_date)],
    ['Servicer', SERVICER],
  ];
  const rightRows: [string, string][] = [
    ['Total Disbursed', money(stmt.totalDisbursed)],
    ['Remaining Draw Balance', money(stmt.remainingDraw)],
    [`Total Draws ${shortPeriod}`, money(stmt.periodDrawTotal)],
    [`Interest Accrued ${shortPeriod}`, money(stmt.periodDrawInterest)],
    ['Previous Balance', money(ledger.previousBalance)],
    ['Payments Received', ledger.paymentsThisPeriod > 0 ? `(${money(ledger.paymentsThisPeriod)})` : money(0)],
    ['Current Charges', money(ledger.currentCharge)],
  ];

  const ROW = 20;
  ensure(Math.max(leftRows.length, rightRows.length + 2) * ROW + 20);

  const drawCol = (rows: [string, string][], x: number, xr: number, startY: number) => {
    let cy = startY;
    for (const [k, v] of rows) {
      text(k, x, cy, 9.5, bold, NAVY);
      rightText(v, xr, cy, 9.5);
      page.drawLine({ start: { x, y: cy - 5 }, end: { x: xr, y: cy - 5 }, thickness: 0.5, color: SOFT });
      cy -= ROW;
    }
    return cy;
  };

  const leftEnd = drawCol(leftRows, leftX, leftR, y);
  let rightEnd = drawCol(rightRows, rightX, rightR, y);

  // Amount Due band, sitting under the right column like the website card
  rightEnd -= 2;
  page.drawRectangle({ x: rightX, y: rightEnd - 6, width: colW, height: 26, color: PALE });
  text('Amount Due', rightX + 10, rightEnd + 2, 12, bold, NAVY);
  rightText(money(ledger.amountDue), rightR - 10, rightEnd + 2, 12, bold, NAVY);
  rightEnd -= 26;

  y = Math.min(leftEnd, rightEnd) - 24;

  // ---- Draw table: THIS PERIOD ONLY
  ensure(58);
  text(`Construction Draws (${stmt.periodLabel})`, M, y + 6, 11, bold, NAVY);
  y -= 28;   // breathing room between the heading and the table header
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: NAVY_MED });
  text('DATE', M + 6, y + 2, 9, bold, rgb(1, 1, 1));
  text('DESCRIPTION', M + 96, y + 2, 9, bold, rgb(1, 1, 1));
  rightText('AMOUNT', M + 330, y + 2, 9, bold, rgb(1, 1, 1));
  rightText('INTEREST ACCRUED', width - M - 6, y + 2, 9, bold, rgb(1, 1, 1));
  y -= 22;

  if (stmt.periodDraws.length === 0) {
    text('No draws during this period.', M + 6, y, 10, font, MUTED);
    y -= 18;
  } else {
    for (const d of stmt.periodDraws) {
      ensure(18);
      text(fmtDate(d.draw_date), M + 6, y, 9);
      text(String(d.description).slice(0, 40), M + 96, y, 9);
      rightText(money(d.amount), M + 330, y, 9);
      rightText(money(drawInterest(Number(d.amount), rate, d.draw_date)), width - M - 6, y, 9);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: width - M, y: y - 5 }, thickness: 0.4, color: rgb(0.93, 0.945, 0.97) });
      y -= 18;
    }
    ensure(20);
    text('Total for period', M + 6, y - 2, 9.5, bold, NAVY);
    rightText(money(stmt.periodDrawTotal), M + 330, y - 2, 9.5, bold, NAVY);
    rightText(money(stmt.periodDrawInterest), width - M - 6, y - 2, 9.5, bold, NAVY);
    y -= 22;
  }

  // ---- payments received this period
  if (ledger.paymentsInPeriod.length) {
    y -= 22; ensure(50);
    text(`Payments Received (${stmt.periodLabel})`, M, y + 6, 11, bold, NAVY);
    y -= 28;
    page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: NAVY_MED });
    text('DATE', M + 6, y + 2, 9, bold, rgb(1, 1, 1));
    text('METHOD', M + 96, y + 2, 9, bold, rgb(1, 1, 1));
    text('NOTE', M + 220, y + 2, 9, bold, rgb(1, 1, 1));
    rightText('AMOUNT', width - M - 6, y + 2, 9, bold, rgb(1, 1, 1));
    y -= 22;
    for (const p of ledger.paymentsInPeriod) {
      ensure(18);
      text(fmtDate(p.payment_date), M + 6, y, 9);
      text(String(p.method || '').slice(0, 22), M + 96, y, 9);
      text(String(p.note || '').slice(0, 40), M + 220, y, 9);
      rightText(money(p.amount), width - M - 6, y, 9);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: width - M, y: y - 5 }, thickness: 0.4, color: rgb(0.93, 0.945, 0.97) });
      y -= 18;
    }
  }

  // ---- anything still open from earlier months
  if (ledger.priorUnpaid.length) {
    y -= 22; ensure(60);
    text('Unpaid Previous Charges', M, y + 6, 11, bold, rgb(0x8a / 255, 0x1c / 255, 0x18 / 255));
    y -= 28;
    page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: NAVY_MED });
    text('STATEMENT MONTH', M + 6, y + 2, 9, bold, rgb(1, 1, 1));
    rightText('CHARGED', M + 300, y + 2, 9, bold, rgb(1, 1, 1));
    rightText('PAID', M + 400, y + 2, 9, bold, rgb(1, 1, 1));
    rightText('STILL OWED', width - M - 6, y + 2, 9, bold, rgb(1, 1, 1));
    y -= 22;
    for (const r of ledger.priorUnpaid) {
      ensure(18);
      text(r.label, M + 6, y, 9);
      rightText(money(r.charge), M + 300, y, 9);
      rightText(money(r.paid), M + 400, y, 9);
      rightText(money(r.balance), width - M - 6, y, 9);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: width - M, y: y - 5 }, thickness: 0.4, color: rgb(0.93, 0.945, 0.97) });
      y -= 18;
    }
    ensure(20);
    text('Total past due', M + 6, y - 2, 9.5, bold, NAVY);
    rightText(money(ledger.priorUnpaid.reduce((s, r) => s + r.balance, 0)), width - M - 6, y - 2, 9.5, bold, NAVY);
    y -= 22;
  }

  // ---- how to pay
  const pay = extras.payInfo;
  if (pay && (pay.instructions || pay.method)) {
    const lines = String(pay.instructions || '').split(/\r?\n/).filter(l => l.trim() !== '');
    const boxH = 30 + lines.length * 13;
    y -= 24;
    if (y - boxH < 60) { page = doc.addPage([612, 792]); y = 748; }
    page.drawRectangle({ x: M, y: y - boxH + 14, width: width - 2 * M, height: boxH, color: PALE });
    text(`How to Pay${pay.method ? ' -- ' + pay.method : ''}`, M + 12, y, 11, bold, NAVY);
    y -= 17;
    for (const l of lines) {
      text(l.trim().slice(0, 88), M + 12, y, 9.5, font, INK);
      y -= 13;
    }
    y -= 14;
  }

  y -= 16; ensure(14);
  text('Questions about this statement? Reply directly to the email this was sent from.', M, y, 9, font, MUTED);

  return await doc.save();
}
