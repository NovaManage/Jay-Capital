import { randomUUID } from 'crypto';
import { serviceClient } from '@/lib/supabase-server';

export type ActivityKind =
  // borrower / session
  | 'sign_in' | 'sign_out' | 'account_created' | 'email_changed' | 'password_changed'
  | 'portal_view' | 'statement_view' | 'pdf_download'
  // admin: loans
  | 'loan_created' | 'loan_updated' | 'loan_deleted' | 'loan_status_changed'
  // admin: draws and payments
  | 'draw_added' | 'draw_updated' | 'draw_deleted'
  | 'payment_added' | 'payment_updated' | 'payment_deleted'
  // admin: people and lenders
  | 'statement_emailed' | 'user_invited' | 'user_updated' | 'user_active_changed'
  | 'user_deleted' | 'password_reset_sent' | 'borrower_login_created'
  | 'lender_added' | 'lender_updated' | 'lender_active_changed'
  | 'loans_imported';

/**
 * How long an identical event counts as the same event.
 *
 * Server components re-render for reasons unrelated to the user doing
 * anything: LiveRefresh calls router.refresh() every 15 seconds, and one
 * sign-in can pass through /go more than once between the RSC fetch and the
 * document request.
 *
 * Deliberate actions are NOT deduplicated -- recording two payments a minute
 * apart is two real events, and collapsing them would hide work.
 */
const DEDUPE_MS: Partial<Record<ActivityKind, number>> = {
  portal_view: 15 * 60_000,
  statement_view: 15 * 60_000,
  pdf_download: 2 * 60_000,
  sign_in: 10 * 60_000,
  account_created: 60 * 60_000,
};

/**
 * Record something a user did.
 *
 * Deduplication is enforced by a unique index on dedupe_key, not by looking
 * first: a check-then-insert loses the race when two renders arrive together,
 * which is exactly how sign-ins were still doubling. The key buckets time, so
 * concurrent writes collide on the same value and the second is discarded by
 * the database.
 *
 * Never throws. Analytics must not be able to break a statement.
 */
export async function logActivity(
  kind: ActivityKind,
  loanId: string | null,
  userId: string | null,
  detail?: string | null,
): Promise<void> {
  try {
    const window = DEDUPE_MS[kind] ?? 0;
    const row: Record<string, unknown> = {
      kind,
      loan_id: loanId,
      user_id: userId,
      detail: detail ?? null,
    };

    // dedupe_key is ALWAYS set. The unique index it relies on is not partial,
    // so a null key would be inferable but ambiguous -- and more importantly a
    // deliberate action must never collide with another, hence the random
    // value when there is no dedupe window.
    row.dedupe_key = window > 0
      ? [kind, userId ?? '-', loanId ?? '-', detail ?? '-', Math.floor(Date.now() / window)].join('|')
      : `${kind}:${randomUUID()}`;

    const { error } = await serviceClient()
      .from('portal_activity')
      .upsert(row, { onConflict: 'dedupe_key', ignoreDuplicates: true });

    // Logging must never break a page, but a silent failure once hid the fact
    // that nothing was being recorded at all. Surfaced in the server log only.
    if (error) console.error('[activity] not recorded:', error.message, { kind });
  } catch (e) {
    console.error('[activity] not recorded:', e instanceof Error ? e.message : e);
  }
}

/**
 * The signed-in user, for attributing activity. Attribution only -- it never
 * affects access.
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
