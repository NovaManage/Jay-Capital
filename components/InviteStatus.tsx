import { fmtDateTime } from '@/lib/format';

/**
 * Where an account is in the invitation process.
 *
 * Three states worth distinguishing, because each calls for a different
 * action: never invited (send one), invited but never signed in (chase or
 * re-send), and set up (nothing to do).
 */
export default function InviteStatus({
  invitedAt, activatedAt, lastSeenAt,
}: { invitedAt: string | null; activatedAt: string | null; lastSeenAt: string | null }) {
  if (activatedAt) {
    return (
      <div style={{ lineHeight: 1.5 }}>
        <span className="badge staff">set up</span>
        <div className="muted" style={{ fontSize: 12 }}>
          {lastSeenAt ? `Last signed in ${fmtDateTime(lastSeenAt)}` : `Since ${fmtDateTime(activatedAt)}`}
        </div>
      </div>
    );
  }

  if (invitedAt) {
    const days = Math.floor((Date.now() - new Date(invitedAt).getTime()) / 86400000);
    return (
      <div style={{ lineHeight: 1.5 }}>
        <span className="badge borrower">awaiting setup</span>
        <div className="muted" style={{ fontSize: 12 }}>
          Invited {fmtDateTime(invitedAt)}
          {days >= 3 && <span style={{ color: 'var(--danger)' }}> · {days} days ago</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ lineHeight: 1.5 }}>
      <span className="muted" style={{ fontSize: 13 }}>No invitation sent</span>
      <div className="muted" style={{ fontSize: 12 }}>Password was set manually</div>
    </div>
  );
}
