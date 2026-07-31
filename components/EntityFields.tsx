'use client';

import { useState } from 'react';

/**
 * Entity name is off by default. Tick the box and the field appears; leave it
 * unticked and the loan stays under the borrower's personal name.
 */
export default function EntityFields({
  defaultIsEntity = false, defaultEntityName = '',
}: { defaultIsEntity?: boolean; defaultEntityName?: string }) {
  const [isEntity, setIsEntity] = useState(defaultIsEntity);
  const [name, setName] = useState(defaultEntityName);

  return (
    <>
      <div className="field-wrap" style={{ gridColumn: '1 / -1' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
          <input
            type="checkbox" name="is_entity" checked={isEntity}
            onChange={e => setIsEntity(e.target.checked)}
          />
          <span style={{ fontWeight: 700, color: 'var(--navy)' }}>This loan is held by an entity</span>
        </label>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          Borrowers see the entity name on their statements and portal. Your dashboard
          keeps listing the personal name.
        </p>
      </div>

      {isEntity && (
        <div className="field-wrap" style={{ gridColumn: '1 / -1' }}>
          <label>Entity Name *</label>
          <input
            className="field" name="entity_name" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. 400 Rella Holdings LLC" required
          />
        </div>
      )}
    </>
  );
}
