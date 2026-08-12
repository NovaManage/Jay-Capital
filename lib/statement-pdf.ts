import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import { MARK_PNG_BASE64, BRAND } from '@/lib/brand-assets';
import { buildStatement, drawInterest, type Draw as EngineDraw } from '@/lib/interest';
import { money, pct, fmtDate, statementPeriod, borrowerDisplayName } from '@/lib/format';
import { buildLedger, type PaymentRow, type AllocationRow } from '@/lib/ledger';
import type { StatementLoan, StatementDraw } from '@/lib/statement-html';

export const SERVICER = 'Jay Capital Funding Inc.';
export interface StatementExtras {
  payments?: PaymentRow[];
  allocations?: AllocationRow[];
  payInfo?: { method: string | null; instructions: string | null } | null;
}

// Same values as the portal and the marketing site, from the branding package.
const NAVY = rgb(0x04 / 255, 0x16 / 255, 0x2a / 255);   // brand ink
const NAVY_MED = rgb(0x0e / 255, 0x2a / 255, 0x47 / 255);
const GOLD = rgb(0xc0 / 255, 0x95 / 255, 0x4a / 255);   // brand gold
const INK = rgb(0.2, 0.2, 0.2);
const MUTED = rgb(0.42, 0.48, 0.56);
const SOFT = rgb(0xa8 / 255, 0xb6 / 255, 0xc9 / 255);
const PALE = rgb(0xed / 255, 0xf2 / 255, 0xf8 / 255);

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
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mark = await doc.embedPng(Buffer.from(MARK_PNG_BASE64, 'base64'));

  const PW = 612, PH = 792, M = 54;
  const MARK_RATIO = mark.width / mark.height;
  const pages: PDFPage[] = [];

  /**
   * The watermark is drawn as the page is created, so everything else lands on
   * top of it. Drawing it at the end would float it over the numbers.
   */
  const newPage = (): PDFPage => {
    const p = doc.addPage([PW, PH]);
    const wmH = 430, wmW = wmH * MARK_RATIO;
    p.drawImage(mark, {
      x: (PW - wmW) / 2, y: (PH - wmH) / 2,
      width: wmW, height: wmH, opacity: 0.05,
    });
    pages.push(p);
    return p;
  };

  let page = newPage();
  const width = PW;
  let y = 748;

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = INK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const rightText = (s: string, xRight: number, yy: number, size = 10, f = font, color = INK) => {
    const w = f.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - w, y: yy, size, font: f, color });
  };
  // 78pt floor keeps content clear of the footer band.
  const ensure = (need: number) => { if (y - need < 74) { page = newPage(); y = 748; } };

  /** Draw text centred on cx with letter tracking; returns its total width. */
  const tracked = (str: string, cx: number, yy: number, size: number, f: typeof font, color: any, track: number) => {
    const chars = [...str];
    const widths = chars.map(ch => f.widthOfTextAtSize(ch, size));
    const total = widths.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
    let x = cx - total / 2;
    chars.forEach((ch, i) => {
      page.drawText(ch, { x, y: yy, size, font: f, color });
      x += widths[i] + track;
    });
    return total;
  };

  // ---- Header: the logo on its own, centred, mark stacked over the wordmark.
  // Company details are the footer's job -- they were on the page twice.
  const cx = width / 2;
  const markH = 26, markW = markH * MARK_RATIO;
  page.drawImage(mark, { x: cx - markW / 2, y: y - 8, width: markW, height: markH });

  y -= 22;
  tracked('JAY CAPITAL', cx, y, 10.5, bold, NAVY, 2.3);

  y -= 11;
  const fundW = tracked('FUNDING', cx, y, 6.5, bold, GOLD, 3.6);
  // the hairlines that flank FUNDING in the brand lockup
  const gap = 7, ruleW = 26;
  page.drawRectangle({ x: cx - fundW / 2 - gap - ruleW, y: y + 2, width: ruleW, height: 0.7, color: GOLD });
  page.drawRectangle({ x: cx + fundW / 2 + gap, y: y + 2, width: ruleW, height: 0.7, color: GOLD });

  y -= 16;
  page.drawRectangle({ x: M, y: y - 2, width: width - 2 * M, height: 1.6, color: GOLD });
  y -= 17;

  const title = 'LOAN STATEMENT';
  const tw = bold.widthOfTextAtSize(title, 14);
  text(title, (width - tw) / 2, y, 14, bold, NAVY);
  y -= 20;

  // ---- Borrower (full address, wrapped) on the left, date + period on the right
  const topY = y;
  text(borrowerDisplayName(loan as any), M, y, 13, bold, NAVY); y -= 15;
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

  y = Math.min(y, ry) - 22;

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
    ['Base Balance Interest', money(stmt.baseInterest)],
    [`Interest Accrued ${shortPeriod}`, money(stmt.periodDrawInterest)],
    ['Previous Balance', money(ledger.previousBalance)],
    ['Payments Received', ledger.paymentsThisPeriod > 0 ? `(${money(ledger.paymentsThisPeriod)})` : money(0)],
    ['Previous Open Balance', money(ledger.previousOpenBalance)],
    ['Current Charges', money(ledger.currentCharge)],
  ];
  // When a statement bills two periods -- the first billed one, carrying the
  // deferred closing month -- show what makes up the figure.
  if (ledger.currentPeriods.length > 1) {
    for (const c of ledger.currentPeriods) {
      rightRows.push([`   ${c.label} interest`, money(c.charge)]);
    }
  }

  const ROW = 16;
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
  drawCol(rightRows, rightX, rightR, y);

  // Amount Due band, sitting under the right column like the website card.
  // Anchored to the LAST ROW's baseline, not to the running cursor: deriving
  // it from the row pitch meant tightening ROW walked the band up into the
  // Current Charges text above it.
  const lastBaseline = y - (rightRows.length - 1) * ROW;
  const bandH = 24;
  const bandTop = lastBaseline - 12;          // clears that row's underline at -5
  const bandY = bandTop - bandH;
  page.drawRectangle({ x: rightX, y: bandY, width: colW, height: bandH, color: PALE });
  text('Amount Due', rightX + 10, bandY + 8, 12, bold, NAVY);
  rightText(money(ledger.amountDue), rightR - 10, bandY + 8, 12, bold, NAVY);
  const rightEnd = bandY - 4;
  let rightEndAdjust = 0;

  if (ledger.deferredToNext) {
    text('Nothing due yet — closing-month interest is billed on your next statement.',
      rightX, bandY - 12, 8, font, MUTED);
    rightEndAdjust = 14;
  }

  y = Math.min(leftEnd, rightEnd - rightEndAdjust) - 15;

  // ---- Draw table: THIS PERIOD ONLY
  ensure(58);
  text(`Construction Draws (${stmt.periodLabel})`, M, y + 6, 11, bold, NAVY);
  y -= 18;   // heading sits close to its table, with a little white space
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
    y -= 13; ensure(50);
    text('Payments Received', M, y + 6, 11, bold, NAVY);
    y -= 18;
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
    y -= 13; ensure(60);
    text('Unpaid Previous Charges', M, y + 6, 11, bold, rgb(0x8a / 255, 0x1c / 255, 0x18 / 255));
    y -= 18;
    page.drawRectangle({ x: M, y: y - 4, width: width - 2 * M, height: 20, color: NAVY_MED });
    text('STATEMENT DATE', M + 6, y + 2, 9, bold, rgb(1, 1, 1));
    rightText('CHARGED', M + 300, y + 2, 9, bold, rgb(1, 1, 1));
    rightText('PAID', M + 400, y + 2, 9, bold, rgb(1, 1, 1));
    rightText('STILL OWED', width - M - 6, y + 2, 9, bold, rgb(1, 1, 1));
    y -= 22;
    for (const r of ledger.priorUnpaid) {
      ensure(18);
      text(fmtDate(r.statementDate), M + 6, y, 9);
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
    const boxH = 25 + lines.length * 11.5;
    y -= 14;
    if (y - boxH < 58) { page = newPage(); y = 748; }
    page.drawRectangle({ x: M, y: y - boxH + 14, width: width - 2 * M, height: boxH, color: PALE });
    text(`How to Pay${pay.method ? ' — ' + pay.method : ''}`, M + 12, y, 10.5, bold, NAVY);
    y -= 15;
    for (const l of lines) {
      text(l.trim().slice(0, 92), M + 12, y, 9, font, INK);
      y -= 11.5;
    }
    y -= 12;
  }

  // ---- footer on every page, once the page count is known
  // Give them the actual contact details rather than telling them to reply to
  // an email -- a statement gets printed, forwarded and filed away from the
  // message it arrived in.
  const askLine = `Questions about this statement? Call ${BRAND.phone} or email ${BRAND.email}`;
  const footLine = `${BRAND.legal}  ·  ${BRAND.address}`;
  pages.forEach((p, i) => {
    p.drawRectangle({ x: M, y: 64, width: PW - 2 * M, height: 0.8, color: GOLD });
    const aw = font.widthOfTextAtSize(askLine, 7.5);
    p.drawText(askLine, { x: (PW - aw) / 2, y: 52, size: 7.5, font, color: MUTED });
    const fw = bold.widthOfTextAtSize(footLine, 7.5);
    p.drawText(footLine, { x: (PW - fw) / 2, y: 39, size: 7.5, font: bold, color: NAVY });
    if (pages.length > 1) {
      const pn = `Page ${i + 1} of ${pages.length}`;
      const pw = font.widthOfTextAtSize(pn, 7.5);
      p.drawText(pn, { x: PW - M - pw, y: 27, size: 7.5, font, color: MUTED });
    }
  });

  return await doc.save();
}
