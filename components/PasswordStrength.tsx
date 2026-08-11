'use client';

import { checkPassword, SCORE_LABEL, MIN_LENGTH } from '@/lib/password';

/**
 * Live feedback under a password field.
 *
 * Shows what is still wrong rather than a bare "not strong enough", because a
 * rule you cannot see is a rule you cannot satisfy. Uses the same
 * checkPassword the server uses, so the bar can never say a password is fine
 * when the server is about to reject it.
 */
export default function PasswordStrength({
  password, email,
}: { password: string; email?: string }) {
  if (!password) {
    return (
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
        At least {MIN_LENGTH} characters, mixing upper case, lower case, numbers and a
        symbol — or a longer passphrase.
      </p>
    );
  }

  const { ok, problems, score } = checkPassword(password, email);
  const colours = ['var(--danger)', 'var(--danger)', '#B8860B', 'var(--ok)', 'var(--ok)'];
  const colour = colours[score];

  return (
    <div style={{ margin: '6px 0 0' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }} aria-hidden="true">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i < score ? colour : 'var(--navy-soft)',
              transition: 'background .18s ease',
            }}
          />
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: colour }} aria-live="polite">
        {SCORE_LABEL[score]}
      </div>

      {!ok && (
        <ul className="muted" style={{ fontSize: 12, margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.55 }}>
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
    </div>
  );
}
