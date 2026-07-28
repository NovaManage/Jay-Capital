'use client';
import { useState } from 'react';
import { setUserRole } from '@/lib/actions';

export default function UserRoleControls({ userId, current, isSelf }: {
  userId: string; current: string; isSelf: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <select className="filter" defaultValue={current} disabled={busy || isSelf}
      title={isSelf ? "You can't change your own role" : ''}
      onChange={async e => { setBusy(true); await setUserRole(userId, e.target.value as any); setBusy(false); }}>
      <option value="admin">admin</option>
      <option value="staff">staff</option>
      <option value="borrower">borrower</option>
    </select>
  );
}
