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

export async function logActivity(
  kind: ActivityKind,
  loanId: string | null,
  userId: string | null,
): Promise<void> {
  try {
    await serviceClient().from('portal_activity').insert({ kind, loan_id: loanId, user_id: userId });
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
