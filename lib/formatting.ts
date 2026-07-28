/**
 * Input tidying for the loan forms.
 *
 * Deliberately conservative: these run on what a person typed, so the guiding
 * rule is never to destroy information. Anything that doesn't look like a
 * plain US phone number or address is returned close to as-entered.
 */

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC','PR','VI','GU','AS','MP',
]);

/** Tokens that belong in caps regardless of how they were typed. */
const ALWAYS_UPPER = new Set(['NE','NW','SE','SW','N','S','E','W','PO','US','LLC','LP','INC']);

/**
 * Progressive US phone formatting, safe to run on every keystroke.
 * Anything starting with "+" or longer than a US number is left alone so
 * international numbers and extensions survive.
 */
export function formatPhone(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed;

  const d = trimmed.replace(/\D/g, '');
  if (!d) return '';

  if (d.length === 11 && d[0] === '1') {
    return `1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 11)}`;
  }
  if (d.length > 10) return trimmed;          // unusual -- don't mangle it

  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function titleCaseWord(w: string): string {
  if (!w) return w;

  // Numbers: ordinals stay lowercase (1st, 2nd); unit letters go up (4b -> 4B).
  if (/^\d/.test(w)) {
    return w.replace(/^(\d+)([a-zA-Z]*)$/, (_, n, suf) => {
      if (!suf) return n;
      if (/^(st|nd|rd|th)$/i.test(suf)) return n + suf.toLowerCase();
      if (suf.length <= 2) return n + suf.toUpperCase();
      return n + suf.charAt(0).toUpperCase() + suf.slice(1).toLowerCase();
    });
  }

  const bare = w.replace(/[^A-Za-z]/g, '');
  if (bare.length === 2 && US_STATES.has(bare.toUpperCase())) return w.toUpperCase();
  if (ALWAYS_UPPER.has(bare.toUpperCase())) return w.toUpperCase();

  // Mixed case is assumed intentional (McDonald, O'Brien, LaSalle) -- leave it.
  const allLower = w === w.toLowerCase();
  const allUpper = w === w.toUpperCase();
  if (!allLower && !allUpper) return w;

  const lower = w.toLowerCase();
  // Mc/Mac and O' keep their internal capital.
  if (/^mc[a-z]{2,}/.test(lower)) return 'Mc' + lower.charAt(2).toUpperCase() + lower.slice(3);
  if (/^o'[a-z]{2,}/.test(lower)) return "O'" + lower.charAt(2).toUpperCase() + lower.slice(3);

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Tidy an address: normalise spacing and comma spacing, capitalise sensibly,
 * uppercase state codes. Run this on blur, not per keystroke.
 */
export function formatAddress(raw: string): string {
  if (!raw) return '';

  const s = raw
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ',')   // strip padding first...
    .replace(/,+/g, ',')         // ...so repeats collapse cleanly
    .replace(/,/g, ', ')         // then put one space back
    .replace(/\s+/g, ' ')
    .replace(/[\s,]+$/, '')
    .replace(/^[\s,]+/, '')
    .trim();

  return s
    .split(' ')
    .map(tok => {
      const trailing = tok.endsWith(',') ? ',' : '';
      const core = trailing ? tok.slice(0, -1) : tok;
      return titleCaseWord(core) + trailing;
    })
    .join(' ');
}
