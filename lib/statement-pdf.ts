import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { buildStatement, drawInterest, type Draw as EngineDraw } from '@/lib/interest';
import { money, pct, fmtDate, statementPeriod } from '@/lib/format';
import type { StatementLoan, StatementDraw } from '@/lib/statement-html';

const NAVY = rgb(0x1f / 255, 0x38 / 255, 0x64 / 255);
const NAVY_MED = rgb(0x2e / 255, 0x4b / 255, 0x7a / 255);
const INK = rgb(0.2, 0.2, 0.2);
const MUTED = rgb(0.42, 0.48, 0.56);
const SOFT = rgb(0x85 / 255, 0x9a / 255, 0xc6 / 255);
const PALE = rgb(0xee / 255, 0xf2 / 255, 0xf9 / 255);

/**
 * Draw the statement as a print-ready PDF, mirroring the website card:
 * navy title rule, summary rows, base/draw interest breakdown, Amount Due band,
 * then the full since-closing draw table (each row = that draw's first-month interest).
 */
export async function statementPDF(loan: StatementLoan, draws: StatementDraw[], statementDate: string): Promise<Uint8Array> {
  const rate = Number(loan.annual_rate);
  const engineDraws: EngineDraw[] = draws.map(d => ({ draw_date: d.draw_date, amount: Number(d.amount), description: d.description }));
  const stmt = buildStatement(
    { loan_amount: Number(loan.loan_amount), acquisition: Number(loan.acquisition), annual_rate: rate, closing_date: loan.closing_date },
    engineDraws, statementDate
  );
  const period = statementPeriod(String(statementDate).slice(0, 10));

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

  // Title + navy rule (matches website header)
  const title = 'LOAN STATEMENT';
  const tw = bold.widthOfTextAtSize(title, 18);
  text(title, (width - tw) / 2, y, 18, bold, NAVY);
  y -= 12;
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 3, color: NAVY });
  y -= 30;

  // Borrower block (left, FULL address) + statement date & period (right)
  const topY = y;
  text(loan.borrower_name, M, y, 13, bold, NAVY); y -= 15;
  // wrap the full address if long
  const addr = loan.property || '';
  const maxAddrW = 300;
  const words = addr.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(test, 10) > maxAddrW && line) { text(line, M, y, 10, font, MUTED); y -= 13; line = w; }
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

  y = Math.min(y, ry) - 24;

  // Summary rows
  const rows: [string, string][] = [
    ['Loan Amount', money(loan.loan_amount)],
    ['Total Disbursed', money(stmt.totalDisbursed)],
    ['Acquisition', money(loan.acquisition)],
    ['Remaining Draw Balance', money(stmt.remainingDraw)],
    ['Construction Budget', money(loan.construction)],
    ['Interest Rate', pct(loan.annual_rate)],
    ['Closing Date', fmtDate(loan.closing_date)],
    ['Lender', loan.lender_name || ''],
  ];
  for (const [k, v] of rows) {
    ensure(20);
    text(k, M, y, 10, bold, NAVY);
    rightText(v, width - M, y, 10);
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: width - M, y: y - 5 }, thickness: 0.5, color: SOFT });
    y -= 20;
  }

  // Interest breakdown (base + this period's draw interest)
  y -= 4;
  for (const [k, v] of [['Base Balance Interest', money(stmt.baseInterest)], ['Draw Interest (this period)', money(stmt.periodDrawInterest)]] as [string, string][]) {
    ensure(20);
    text(k, M, y, 10, bold, NAVY);
    rightText(v, width - M, y, 10);
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: width - M, y: y - 5 }, thickness: 0.5, color: SOFT });
    y -= 20;
  }

  // Amount due band
  y -= 6; ensure(30);
  page.drawRectangle({ x: M, y: y - 6, width: width - 2 * M, height: 26, color: PALE });
  text('Amount Due', M + 10, y + 2, 13, bold, NAVY);
  rightText(money(stmt.amountDue), width - M - 10, y + 2, 13, bold, NAVY);
  y -= 46;

  // Draw table header
  ensure(30);
  text('Construction Draws (since closing)', M, y + 6, 11, bold, NAVY);
  y -= 10;
  page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: NAVY_MED });
  text('DATE', M + 6, y + 2, 9, bold, rgb(1, 1, 1));
  text('DESCRIPTION', M + 96, y + 2, 9, bold, rgb(1, 1, 1));
  rightText('AMOUNT', M + 315, y + 2, 9, bold, rgb(1, 1, 1));
  rightText('INTEREST ACCRUED', width - M - 6, y + 2, 9, bold, rgb(1, 1, 1));
  y -= 22;

  const construction = draws.filter(d => d.description === 'Construction Draw');
  if (construction.length === 0) {
    text('No draw activity on file.', M + 6, y, 10, font, MUTED);
    y -= 16;
  } else {
    for (const d of construction) {
      ensure(18);
      const int = drawInterest(Number(d.amount), rate, d.draw_date);
      text(fmtDate(d.draw_date), M + 6, y, 9);
      text(d.description.slice(0, 40), M + 96, y, 9);
      rightText(money(d.amount), M + 315, y, 9);
      rightText(money(int), width - M - 6, y, 9);
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: width - M, y: y - 5 }, thickness: 0.4, color: rgb(0.93, 0.945, 0.97) });
      y -= 18;
    }
  }

  y -= 20; ensure(14);
  text('Questions about this statement? Reply directly to the email this was sent from.', M, y, 9, font, MUTED);

  return await doc.save();
}
