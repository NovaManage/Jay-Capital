/**
 * Jay Capital -- interest engine.
 *
 * Verified against the production Google Sheet: see lib/interest.test.js.
 *
 * MODEL (confirmed with Ari):
 *   At closing the borrower prepays interest for the closing month on the
 *   acquisition amount. Therefore:
 *     - CLOSING MONTH: amount due = interest on that month's draws only.
 *     - LATER MONTHS:  full month on the base balance (acquisition + draws
 *                      disbursed BEFORE this period) + prorated interest on
 *                      draws taken DURING this period.
 *
 *   A draw prorates ONLY in the month it is taken. Afterwards it folds into
 *   the base balance and accrues a full month like the acquisition amount.
 *   This is why period draws are subtracted from the base before applying
 *   the monthly rate -- otherwise they'd be charged twice.
 *
 *   Rate is monthly (annual/12), prorated by days in that specific month.
 *   NOT a 365-day daily rate: a June draw and a February draw with the same
 *   day count accrue differently. This is intentional.
 */

export const DRAW_DESCRIPTION = 'Construction Draw';

export interface Loan {
  loan_amount: number;
  acquisition: number;
  annual_rate: number;   // 0.12 = 12%
  closing_date: string;  // YYYY-MM-DD
}

export interface Draw {
  draw_date: string;     // YYYY-MM-DD
  amount: number;
  description: string;
}

export interface Statement {
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  totalDisbursed: number;
  remainingDraw: number;
  periodDraws: Draw[];
  periodDrawTotal: number;
  periodDrawInterest: number;
  baseBalance: number;
  baseInterest: number;
  amountDue: number;
  prepaidAtClosing: boolean;
}

/** Parse YYYY-MM-DD without timezone drift. */
export function parseDate(s: string | Date): Date {
  if (s instanceof Date) return s;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Year-month ordinal, for chronological comparison across year boundaries. */
export function ym(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

/**
 * Interest on a single draw for the month it was taken.
 * amount * (rate/12) / daysInMonth * (days from draw date through month end, inclusive)
 */
export function drawInterest(amount: number, annualRate: number, drawDate: string | Date): number {
  const d = parseDate(drawDate);
  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  const days = dim - d.getDate() + 1;
  return amount * (annualRate / 12) / dim * days;
}

/** All-time accrued interest: sum of each draw's first-month proration. */
export function totalAccruedInterest(draws: Draw[], annualRate: number): number {
  return draws
    .filter(d => d.description === DRAW_DESCRIPTION)
    .reduce((s, d) => s + drawInterest(d.amount, annualRate, d.draw_date), 0);
}

export function totalDisbursed(loan: Loan, draws: Draw[]): number {
  return draws
    .filter(d => d.description === DRAW_DESCRIPTION)
    .reduce((s, d) => s + d.amount, loan.acquisition);
}

/**
 * Build the statement for the month PRIOR to statementDate.
 * (A June 1 statement covers May -- matching the sheet's EOMONTH(C3,-1).)
 */
export function buildStatement(loan: Loan, draws: Draw[], statementDate: string | Date): Statement {
  const stmt = parseDate(statementDate);
  const periodEnd = new Date(stmt.getFullYear(), stmt.getMonth(), 0);
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
  const periodYM = ym(periodEnd);

  const construction = draws.filter(d => d.description === DRAW_DESCRIPTION);
  const disbursed = totalDisbursed(loan, draws);

  const periodDraws = construction.filter(d => ym(parseDate(d.draw_date)) === periodYM);
  const periodDrawTotal = periodDraws.reduce((s, d) => s + d.amount, 0);
  const periodDrawInterest = periodDraws
    .reduce((s, d) => s + drawInterest(d.amount, loan.annual_rate, d.draw_date), 0);

  // Exclude this period's draws: they're already charged prorated interest.
  const baseBalance = disbursed - periodDrawTotal;

  // Closing month (or earlier): base interest was prepaid at closing.
  const closingYM = ym(parseDate(loan.closing_date));
  const prepaidAtClosing = closingYM >= periodYM;

  const baseInterest = prepaidAtClosing ? 0 : baseBalance * (loan.annual_rate / 12);
  const amountDue = baseInterest + periodDrawInterest;

  return {
    periodStart, periodEnd,
    periodLabel: periodEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    totalDisbursed: disbursed,
    remainingDraw: loan.loan_amount - disbursed,
    periodDraws, periodDrawTotal, periodDrawInterest,
    baseBalance, baseInterest, amountDue, prepaidAtClosing,
  };
}
