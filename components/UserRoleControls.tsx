'use client';
import { useState } from 'react';
import { setUserRole } from '@/lib/actions';

export default function UserRoleControls({ userId, current, isSelf }: {
  userId: string; current: string; isSelf: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <select className="filter" defaultValue={current} disabled={busy || isSelf}
        title={isSelf ? "You can't change your own role" : ''}
        onChange={async e => {
          setBusy(true); setErr('');
          const res = await setUserRole(userId, e.target.value as any);
          setBusy(false);
          if (!res.ok) setErr(res.error || 'Could not change the role.');
        }}>
        <option value="admin">admin</option>
        <option value="staff">staff</option>
        <option value="borrower">borrower</option>
      </select>
      {err && <div className="alert error" style={{ margin: '6px 0 0' }}>{err}</div>}
    </>
  );
}
