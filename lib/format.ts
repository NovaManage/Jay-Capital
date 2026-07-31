export function money(v: number | string | null | undefined): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  const safe = isNaN(n) ? 0 : n;
  return '$' + safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Accepts 0.12 or 12 and always renders "12.00%". */
export function pct(v: number | string | null | undefined): string {
  let n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (isNaN(n)) n = 0;
  if (n > 1) n = n / 100;
  return (n * 100).toFixed(2) + '%';
}

export function rateFraction(v: number | string | null | undefined): number {
  let n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (isNaN(n)) n = 0;
  return n > 1 ? n / 100 : n;
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')) : d;
  if (isNaN(dt.getTime())) return String(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`;
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Dashboard short address: just the street line.
 * Prefers the part before the first comma. If there's no comma (e.g.
 * "400 Rella Blvd Suffern NY 10901"), stop at the first token that looks like
 * a city/state/zip cue: a 5-digit ZIP, a 2-letter state code, or the token
 * right after a street-type word (Blvd, St, Ave, Rd, Dr, Ln, Way, Ct, Pl...).
 */
export function shortAddress(full: string | null | undefined): string {
  if (!full) return '';
  const s = String(full).trim();
  const comma = s.indexOf(',');
  if (comma !== -1) return s.slice(0, comma).trim();

  const tokens = s.split(/\s+/);
  const streetTypes = new Set([
    'st', 'street', 'ave', 'avenue', 'blvd', 'boulevard', 'rd', 'road', 'dr', 'drive',
    'ln', 'lane', 'way', 'ct', 'court', 'pl', 'place', 'ter', 'terrace', 'cir', 'circle',
    'pkwy', 'parkway', 'hwy', 'highway', 'sq', 'square', 'trl', 'trail', 'loop', 'row',
  ]);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const bare = t.replace(/[.,]/g, '').toLowerCase();
    out.push(t);
    // If this token is a street type, the street line ends here.
    if (streetTypes.has(bare)) break;
    // Otherwise stop just BEFORE a ZIP or 2-letter state that follows content.
    const next = tokens[i + 1];
    if (next) {
      const nb = next.replace(/[.,]/g, '');
      if (/^\d{5}(-\d{4})?$/.test(nb) || /^[A-Z]{2}$/.test(nb)) {
        // keep going only if we haven't yet captured a street type; else break
      }
    }
  }
  return out.join(' ').trim();
}

/** First day of the month, as YYYY-MM-01, offset by `delta` months. */
export function firstOfMonth(base: Date | string, delta = 0): string {
  const d = typeof base === 'string' ? new Date(base + (base.length === 10 ? 'T00:00:00' : '')) : base;
  const y = d.getFullYear();
  const m = d.getMonth() + delta;
  const first = new Date(y, m, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
}

/** "August 2026" label for a YYYY-MM-DD date, computed without tz drift. */
export function monthName(dateStr: string): string {
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Valid statement months, newest-first, as YYYY-MM-01.
 * Range: the loan's closing month through ONE month past the current month.
 * (If closing is July 2026, and today is July 2026, you can pick through August 2026.)
 */
export function statementMonths(closingDate: string): string[] {
  const start = firstOfMonth(closingDate);          // closing month
  const end = firstOfMonth(new Date(), 1);           // next month
  const out: string[] = [];
  let cur = start;
  // guard against inverted ranges (closing in the future)
  if (cur > end) return [start];
  for (let i = 0; i < 600 && cur <= end; i++) {
    out.push(cur);
    cur = firstOfMonth(cur, 1);
  }
  return out.reverse();
}

/** Clamp a candidate YYYY-MM-01 to within [min,max] of the valid statement list. */
export function clampMonth(candidate: string, closingDate: string): string {
  const months = statementMonths(closingDate);      // newest-first
  const newest = months[0];
  const oldest = months[months.length - 1];
  if (candidate > newest) return newest;
  if (candidate < oldest) return oldest;
  return candidate;
}

/**
 * The period a statement covers: the calendar month BEFORE the statement date.
 * Returns first and last day as YYYY-MM-DD plus a friendly "M/D/YYYY - M/D/YYYY".
 */
export function statementPeriod(statementDate: string): { start: string; end: string; label: string } {
  const [y, m] = statementDate.slice(0, 10).split('-').map(Number);
  // month before the statement month
  const periodStart = new Date(y, (m || 1) - 2, 1);
  const periodEnd = new Date(y, (m || 1) - 1, 0); // day 0 of statement month = last day of prior month
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(periodStart), end: iso(periodEnd), label: `${fmtDate(iso(periodStart))} - ${fmtDate(iso(periodEnd))}` };
}

/**
 * Who the loan is presented as on borrower-facing screens.
 * Entity loans show the entity; everything else shows the person.
 * The admin dashboard deliberately does NOT use this -- it always lists the
 * personal name so a portfolio stays searchable by who is behind it.
 */
export function borrowerDisplayName(loan: {
  is_entity?: boolean | null; entity_name?: string | null; borrower_name: string;
}): string {
  return loan.is_entity && loan.entity_name ? loan.entity_name : loan.borrower_name;
}
