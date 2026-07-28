'use client';

import { useState } from 'react';

export interface LenderOption { id: string; name: string; active: boolean }

/**
 * Lender picker for the loan forms. Lists active lenders, plus the current
 * lender even if it has since been inactivated (so editing an old loan
 * doesn't silently drop it). Choosing "Add a new lender" reveals a text box;
 * the server creates it and it's on the list from then on.
 */
export default function LenderSelect({
  lenders, currentId, currentName,
}: { lenders: LenderOption[]; currentId?: string | null; currentName?: string | null }) {
  const [value, setValue] = useState<string>(currentId || '');
  const [newName, setNewName] = useState('');

  const options = lenders.filter(l => l.active || l.id === currentId);

  return (
    <div className="field-wrap">
      <label>Lender *</label>
      <select
        className="field"
        name={value === '__new__' ? '_lender_choice' : 'lender_id'}
        value={value}
        onChange={e => setValue(e.target.value)}
        required={value !== '__new__'}
      >
        <option value="">Select a lender&hellip;</option>
        {options.map(l => (
          <option key={l.id} value={l.id}>
            {l.name}{!l.active ? ' (inactive)' : ''}
          </option>
        ))}
        <option value="__new__">+ Add a new lender&hellip;</option>
      </select>

      {value === '__new__' && (
        <input
          className="field"
          name="lender_new_name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New lender name"
          style={{ marginTop: 8 }}
          required
        />
      )}

      {value === '__new__' && (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          This lender will be saved and available on future loans.
        </p>
      )}

      {currentName && !currentId && (
        <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
          Previously recorded as &ldquo;{currentName}&rdquo;.
        </p>
      )}
    </div>
  );
}
