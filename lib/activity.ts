import { serviceClient } from '@/lib/supabase-server';

/**
 * Record a borrower touching their loan. Logged server-side, so no cookie
 * banner and nothing an ad blocker can stop.
 *
 * Deliberately minimal -- kind, loan, user, timestamp. No IP, no user agent,
 * no fingerprint: this exists to tell the admin whether borrowers are
 * actually using the portal, not to profile them.
 *
 * Never throws. Analytics must not be able to break a statement.
 */
export type ActivityKind =
  | 'portal_view'        // opened the portal
  | 'pdf_download'       // downloaded a statement PDF
  | 'statement_month'    // switched to a different statement month
  | 'sign_in'            // signed in
  | 'account_created'    // finished self-signup
  | 'email_changed'      // changed the email on their account
  | 'statement_emailed'  // staff emailed statements to the borrower
  | 'statement_view';    // legacy: public statement link, now removed

/**
 * How long an identical event is treated as the same event.
 *
 * Server components re-render for reasons that have nothing to do with the
 * user doing anything again: LiveRefresh calls router.refresh() every 15
 * seconds, and a single sign-in can pass through /go more than once between
 * the RSC fetch and the document request. Without this, one sign-in shows as
 * two or three lines and an open portal tab logs a view four times a minute.
 *
 * Collapsing on (kind, user, loan) within a window makes the feed read like
 * what actually happened.
 */
const DEDUPE_MS: Record<ActivityKind, number> = {
  portal_view: 15 * 60_000,
  statement_month: 5 * 60_000,
  statement_view: 15 * 60_000,
  pdf_download: 2 * 60_000,
  sign_in: 10 * 60_000,
  account_created: 60 * 60_000,
  email_changed: 60_000,
  statement_emailed: 0,   // each send is a real, separate event
};

export async function logActivity(
  kind: ActivityKind,
  loanId: string | null,
  userId: string | null,
): Promise<void> {
  try {
    const svc = serviceClient();
    const window = DEDUPE_MS[kind] ?? 0;

    if (window > 0) {
      const since = new Date(Date.now() - window).toISOString();
      let q = svc.from('portal_activity')
        .select('id')
        .eq('kind', kind)
        .gte('occurred_at', since)
        .limit(1);

      // .is() for null, .eq() for a value -- Postgres will not match null with =
      q = userId ? q.eq('user_id', userId) : q.is('user_id', null);
      q = loanId ? q.eq('loan_id', loanId) : q.is('loan_id', null);

      const { data: recent } = await q;
      if (recent && recent.length) return;   // already recorded
    }

    await svc.from('portal_activity').insert({ kind, loan_id: loanId, user_id: userId });
  } catch {
    /* analytics is best-effort */
  }
}

/**
 * The signed-in user, if there is one, for attributing activity.
 *
 * Statement links authenticate by token and work signed-out, but a borrower
 * who IS signed in should still be named on the activity feed rather than
 * showing as anonymous. Purely for attribution -- it never affects access.
 */
export async function currentUserIdOrNull(): Promise<string | null> {
  try {
    const { serverClient } = await import('@/lib/supabase-server');
    const { data: { user } } = await serverClient().auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
