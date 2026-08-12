import { buildStatement, type Loan, type Draw } from '@/lib/interest';
import { firstOfMonth, monthName, todayInAppTz } from '@/lib/format';

/**
 * Jay Capital -- statement ledger.
 *
 * Sits ON TOP of lib/interest.ts, which is left untouched. That module
 * answers "what interest was charged for period P". This one answers
 * "what does the borrower owe today, given what they've been charged and
 * what they've paid".
 *
 * MODEL
 *   A CHARGE is one statement period's interest. It is computed, never
 *   stored -- charge(P) === buildStatement(..., P + 1 month).amountDue.
 *
 *   The running balance is DATE-based, which is how a borrower reads a
 *   statement:
 *       Previous Balance   = all charges before P, less all payments dated before P
 *       Less Payments      = payments dated inside P
 *       Plus Current Charges = charge(P)
 *       = Amount Due
 *
 *   The "unpaid previous charges" breakdown is ALLOCATION-based: it shows
 *   which specific months are still open, using what the admin applied each
 *   payment to. If payments have been recorded but not applied to a month,
 *   that shows up as `unapplied` rather than silently skewing the aging.
 *
 *   Unpaid balances do NOT themselves accrue interest -- they carry forward
 *   at face value. This matches interest-only hard-money servicing.
 */

export interface PaymentRow {
  id: string;
  payment_date: string;         // YYYY-MM-DD
  amount: number;
  method?: string | null;
  note?: string | null;
}

export interface AllocationRow {
  payment_id: string;
  period_month: string;         // YYYY-MM-01 of the CHARGE period
  amount: number;
}

export interface PeriodCharge {
  periodMonth: string;          // YYYY-MM-01 of the period the interest covers
  label: string;                // "July 2026" -- the period covered
  statementDate: string;        // YYYY-MM-01 -- the statement this charge bills on
  statementLabel: string;       // "August 2026" -- that statement's month
  charge: number;
  paid: number;
  balance: number;
  inProgress: boolean;          // period hasn't ended yet, so the figure can still move
}

export interface Ledger {
  periodMonth: string;
  periodLabel: string;
  currentCharge: number;
  previousBalance: number;
  paymentsThisPeriod: number;
  /** previousBalance - paymentsThisPeriod: what was still open before this
   *  statement's own charges. Shown so the arithmetic reads straight down
   *  rather than making the borrower do the subtraction. */
  previousOpenBalance: number;
  amountDue: number;
  priorUnpaid: PeriodCharge[];
  /** The period(s) this statement bills. More than one on the first billed
   *  statement, which carries the deferred closing month as well. */
  currentPeriods: PeriodCharge[];
  /** True on a statement that bills nothing because the closing month's
   *  interest has been deferred to the next one. */
  deferredToNext: boolean;
  paymentsInPeriod: PaymentRow[];
  unapplied: number;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** First day of the period a given statement date covers (the month before). */
export function periodMonthFor(statementDate: string): string {
  return firstOfMonth(statementDate, -1);
}

/** Last day of a period month. */
export function periodEndOf(periodMonth: string): string {
  const [y, m] = periodMonth.slice(0, 10).split('-').map(Number);
  return iso(new Date(y, m, 0));
}

/** Every charge period from the closing month through `periodMonth`, oldest first. */
export function periodsThrough(closingDate: string, periodMonth: string): string[] {
  const out: string[] = [];
  let cur = firstOfMonth(closingDate);
  for (let i = 0; i < 600 && cur <= periodMonth; i++) {
    out.push(cur);
    cur = firstOfMonth(cur, 1);
  }
  return out;
}

/** Interest charged for one period. */
export function chargeForPeriod(loan: Loan, draws: Draw[], periodMonth: string): number {
  return buildStatement(loan, draws, firstOfMonth(periodMonth, 1)).amountDue;
}

/**
 * Build the full ledger for the statement dated `statementDate`.
 * Everything is as of that statement's period end -- later payments and
 * later charges do not appear, exactly like draws.
 */
export function buildLedger(
  loan: Loan,
  draws: Draw[],
  payments: PaymentRow[],
  allocations: AllocationRow[],
  statementDate: string,
): Ledger {
  const periodMonth = periodMonthFor(statementDate);
  const periodStart = periodMonth;
  const periodEnd = periodEndOf(periodMonth);

  // A statement bills every period whose due date IS this statement's date.
  // Normally that is just the month it covers, but the first billed statement
  // also carries the deferred closing month.
  const statementMonth = firstOfMonth(statementDate);
  const allPeriods = periodsThrough(loan.closing_date, periodMonth);
  const currentPeriodMonths = allPeriods.filter(p => dueDateFor(p, loan.closing_date) === statementMonth);
  const priorPeriods = allPeriods.filter(p => dueDateFor(p, loan.closing_date) < statementMonth);

  const currentCharge = currentPeriodMonths
    .reduce((sum, p) => sum + chargeForPeriod(loan, draws, p), 0);

  // ---- date-based running balance
  const paidBefore = payments
    .filter(p => p.payment_date < periodStart)
    .reduce((s, p) => s + Number(p.amount), 0);

  const priorCharges = priorPeriods.reduce((s, p) => s + chargeForPeriod(loan, draws, p), 0);
  const previousBalance = priorCharges - paidBefore;

  const paymentsInPeriod = payments
    .filter(p => p.payment_date >= periodStart && p.payment_date <= periodEnd)
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  const paymentsThisPeriod = paymentsInPeriod.reduce((s, p) => s + Number(p.amount), 0);

  const previousOpenBalance = previousBalance - paymentsThisPeriod;
  const amountDue = previousOpenBalance + currentCharge;

  // ---- allocation-based aging of earlier months
  const payById = new Map(payments.map(p => [p.id, p]));
  const asOfAllocations = allocations.filter(a => {
    const pay = payById.get(a.payment_id);
    return pay ? pay.payment_date <= periodEnd : false;
  });

  const paidByPeriod = new Map<string, number>();
  for (const a of asOfAllocations) {
    const key = firstOfMonth(a.period_month);
    paidByPeriod.set(key, (paidByPeriod.get(key) ?? 0) + Number(a.amount));
  }

  const currentPeriods: PeriodCharge[] = currentPeriodMonths.map(p => {
    const charge = chargeForPeriod(loan, draws, p);
    const paid = paidByPeriod.get(p) ?? 0;
    return {
      periodMonth: p, label: monthName(p),
      statementDate: dueDateFor(p, loan.closing_date),
      statementLabel: monthName(dueDateFor(p, loan.closing_date)),
      charge, paid, balance: charge - paid, inProgress: false,
    };
  });

  const priorUnpaid: PeriodCharge[] = priorPeriods
    .map(p => {
      const charge = chargeForPeriod(loan, draws, p);
      const paid = paidByPeriod.get(p) ?? 0;
      return {
        periodMonth: p, label: monthName(p),
        statementDate: dueDateFor(p, loan.closing_date),
        statementLabel: monthName(dueDateFor(p, loan.closing_date)),
        charge, paid, balance: charge - paid, inProgress: false,
      };
    })
    .filter(r => r.balance > 0.005);

  // Payments received but not applied to any month yet.
  const paidToDate = payments
    .filter(p => p.payment_date <= periodEnd)
    .reduce((s, p) => s + Number(p.amount), 0);
  const allocatedToDate = asOfAllocations.reduce((s, a) => s + Number(a.amount), 0);
  const unapplied = Math.max(0, paidToDate - allocatedToDate);

  return {
    periodMonth,
    periodLabel: monthName(periodMonth),
    currentCharge,
    currentPeriods,
    deferredToNext: currentPeriodMonths.length === 0,
    previousBalance,
    paymentsThisPeriod,
    previousOpenBalance,
    amountDue,
    priorUnpaid,
    paymentsInPeriod,
    unapplied,
  };
}

/**
 * When a period's interest falls due: the first of the month AFTER the period,
 * which is also the date of the statement that bills it. August's interest is
 * billed on the 1 September statement and is late from that day.
 */
export function dueDateFor(periodMonth: string, closingDate: string): string {
  // The closing month is not billed on the very next statement. A borrower who
  // closes 6/15 and draws 6/25 gets a full month before anything is owed, so
  // that stub interest is first due 8/1 -- billed alongside July's full month.
  const closingMonth = firstOfMonth(closingDate);
  return firstOfMonth(periodMonth, periodMonth === closingMonth ? 2 : 1);
}

/**
 * Everything genuinely overdue as of a date -- every period whose due date has
 * passed and still carries a balance.
 *
 * This is NOT the same as a statement's "unpaid previous charges". That list
 * is relative to the statement being read: on the 1 September statement,
 * August's interest is the current charge. But the moment 1 September arrives
 * unpaid, August is late. Anything reporting on the book as of today -- the
 * insights past-due table, the alert on a loan -- has to use this, or a month
 * stays invisible until the next statement is issued.
 */
export function pastDueAsOf(
  loan: Loan,
  draws: Draw[],
  payments: PaymentRow[],
  allocations: AllocationRow[],
  asOf: Date | string = new Date(),
): PeriodCharge[] {
  const today = typeof asOf === 'string' ? asOf : iso(asOf);

  const paidByPeriod = new Map<string, number>();
  for (const a of allocations) {
    const key = firstOfMonth(a.period_month);
    paidByPeriod.set(key, (paidByPeriod.get(key) ?? 0) + Number(a.amount));
  }

  // Periods whose due date is on or before today.
  const thisMonth = firstOfMonth(today);
  return periodsThrough(loan.closing_date, firstOfMonth(today, -1))
    .filter(p => dueDateFor(p, loan.closing_date) <= thisMonth)
    .map(p => {
      const charge = chargeForPeriod(loan, draws, p);
      const paid = paidByPeriod.get(p) ?? 0;
      return {
        periodMonth: p, label: monthName(p),
        statementDate: dueDateFor(p, loan.closing_date),
        statementLabel: monthName(dueDateFor(p, loan.closing_date)),
        charge, paid, balance: charge - paid, inProgress: false,
      };
    })
    .filter(r => r.charge > 0.005 && r.balance > 0.005);
}

/**
 * Outstanding balance per period, for the "apply this payment to" picker.
 * Oldest first, settled months dropped.
 *
 * `throughPeriodMonth` defaults to the period now in progress, so from the 1st
 * of a month that month's own charge is already on the list and a payment can
 * be applied to it. An in-progress period is flagged, because a later draw can
 * still move its figure.
 */
export function openCharges(
  loan: Loan,
  draws: Draw[],
  payments: PaymentRow[],
  allocations: AllocationRow[],
  throughPeriodMonth: string = firstOfMonth(todayInAppTz()),
): PeriodCharge[] {
  const currentPeriod = firstOfMonth(todayInAppTz());
  const paidByPeriod = new Map<string, number>();
  for (const a of allocations) {
    const key = firstOfMonth(a.period_month);
    paidByPeriod.set(key, (paidByPeriod.get(key) ?? 0) + Number(a.amount));
  }
  return periodsThrough(loan.closing_date, throughPeriodMonth)
    .map(p => {
      const charge = chargeForPeriod(loan, draws, p);
      const paid = paidByPeriod.get(p) ?? 0;
      return {
        periodMonth: p, label: monthName(p),
        statementDate: dueDateFor(p, loan.closing_date),
        statementLabel: monthName(dueDateFor(p, loan.closing_date)),
        charge, paid, balance: charge - paid, inProgress: p >= currentPeriod,
      };
    })
    .filter(r => r.charge > 0.005 && r.balance > 0.005);
}
