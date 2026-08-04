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
export async function logActivity(
  kind: 'portal_view' | 'statement_view' | 'pdf_download',
  loanId: string | null,
  userId: string | null,
): Promise<void> {
  try {
    await serviceClient().from('portal_activity').insert({ kind, loan_id: loanId, user_id: userId });
  } catch {
    /* analytics is best-effort */
  }
}
