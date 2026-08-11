'use client';

import { useState } from 'react';

/**
 * Password input with a reveal toggle.
 *
 * Typing a 12-character password blind is where people give up and pick
 * something weaker, so letting them check what they typed makes the strength
 * rules easier to live with rather than undermining them.
 *
 * The toggle is a button, not a checkbox, and carries aria-pressed so screen
 * readers announce the state. It is type="button" so it can never submit the
 * form it sits inside.
 */
export default function PasswordField({
  id, value, onChange, autoComplete = 'new-password', required, placeholder, autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch' }}>
      <input
        id={id}
        className="field"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ paddingRight: 68 }}
      />
      <button
        type="button"
        onClick={() => setShown(s => !s)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        title={shown ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
          font: 'inherit', fontSize: 12, fontWeight: 700, letterSpacing: '.04em',
          textTransform: 'uppercase', color: 'var(--navy-med)',
        }}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
