/**
 * Password policy for portal accounts.
 *
 * Length does most of the work, but length alone lets through the things
 * people actually pick -- "1234567890", "passwordpassword", their own email
 * with a digit on the end. So this checks length AND rejects the shapes that
 * make a long password weak: all one character class, keyboard runs,
 * repetition, common words, and anything built from the user's own address.
 *
 * Used by BOTH the browser and the server. The browser copy is for live
 * feedback; the server copy is the one that decides, since anything client-side
 * can be bypassed.
 */

export const MIN_LENGTH = 12;

/** Passwords and stems common enough to be guessed early in any attack. */
const COMMON = [
  'password', 'passw0rd', 'letmein', 'welcome', 'admin', 'qwerty', 'iloveyou',
  'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball', 'trustno1',
  'abc123', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'changeme', 'secret',
  'capital', 'jaycapital', 'funding', 'jaycapitalfunding', 'loan', 'mortgage',
  'portal', 'statement', 'borrower',
];

const KEYBOARD_RUNS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'abcdefghijklmnopqrstuvwxyz',
];

export interface PasswordCheck {
  ok: boolean;
  /** Everything wrong with it, so the user can fix it in one go. */
  problems: string[];
  /** 0-4, for the strength bar. */
  score: number;
}

function hasRun(lower: string, minRun = 4): boolean {
  for (const row of KEYBOARD_RUNS) {
    for (let i = 0; i + minRun <= row.length; i++) {
      const seg = row.slice(i, i + minRun);
      if (lower.includes(seg)) return true;
      if (lower.includes([...seg].reverse().join(''))) return true;
    }
  }
  return false;
}

/** Strip digits people tack on, so "Password2026!" still reads as "password". */
function stem(lower: string): string {
  return lower.replace(/[^a-z]/g, '');
}

export function checkPassword(password: string, email?: string): PasswordCheck {
  const pw = String(password ?? '');
  const lower = pw.toLowerCase();
  const problems: string[] = [];

  if (pw.length < MIN_LENGTH) {
    problems.push(`Use at least ${MIN_LENGTH} characters.`);
  }

  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);

  // Three of four, or a genuinely long passphrase, which is just as strong.
  if (classes < 3 && pw.length < 16) {
    problems.push('Mix upper case, lower case, numbers and a symbol — or use a longer passphrase of at least 16 characters.');
  }

  if (/^\d+$/.test(pw)) {
    problems.push('Numbers alone are easy to guess. Add letters.');
  }

  if (/^(.)\1+$/.test(pw) || /(.)\1{3,}/.test(pw)) {
    problems.push('Avoid repeating the same character.');
  }

  if (hasRun(lower)) {
    problems.push('Avoid keyboard or alphabet runs like "qwerty", "abcd" or "1234".');
  }

  const st = stem(lower);
  if (COMMON.some(w => st.includes(w))) {
    problems.push('Avoid common words and anything based on the company name.');
  }

  if (email) {
    const local = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const domain = String(email).split('@')[1]?.split('.')[0]?.toLowerCase() ?? '';
    if (local.length >= 3 && lower.includes(local)) {
      problems.push('Don’t use your email address in your password.');
    } else if (domain.length >= 3 && st.includes(domain)) {
      problems.push('Don’t use your email domain in your password.');
    }
  }

  // A short password repeated is still short: "abcabcabcabc".
  const unique = new Set(pw).size;
  if (pw.length >= MIN_LENGTH && unique <= 4) {
    problems.push('Use a wider variety of characters.');
  }

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= MIN_LENGTH) score++;
  if (classes >= 3) score++;
  if (pw.length >= 16 || (classes === 4 && pw.length >= 14)) score++;
  if (problems.length) score = Math.min(score, 1);

  return { ok: problems.length === 0, problems, score: Math.max(0, Math.min(4, score)) };
}

export const SCORE_LABEL = ['Too weak', 'Too weak', 'Fair', 'Strong', 'Very strong'];

/** Server-side guard: throws with the first problem, for use inside run(). */
export function assertStrongPassword(password: string, email?: string): void {
  const res = checkPassword(password, email);
  if (!res.ok) throw new Error(res.problems[0]);
}
