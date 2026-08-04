import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * borrowers.user_id decides which account sees which loan, and the email on
 * the borrower record is the source of truth for who that should be.
 *
 * These must be kept in agreement at every point either side can change:
 * signup, a borrower changing their own email, and an admin editing the email
 * on a loan. When they drifted, the old account kept access it should have
 * lost and the correct account could not claim the record.
 *
 * RLS also cross-checks the email (see migration 005), so a stale link fails
 * closed rather than granting access. This keeps the data tidy as well.
 */

/** Point every borrower record with this email at the account that owns it. */
export async function syncBorrowerLinksForEmail(svc: SupabaseClient, emailRaw: string): Promise<number> {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email) return 0;

  const { data: account } = await svc.from('profiles').select('id').ilike('email', email).maybeSingle();
  const { data: records } = await svc.from('borrowers').select('id, user_id').ilike('email', email);
  const rows = records ?? [];
  if (!rows.length) return 0;

  if (!account) {
    // Nobody owns this address yet -- release any link so it can be claimed.
    const toClear = rows.filter(r => r.user_id).map(r => r.id);
    if (toClear.length) await svc.from('borrowers').update({ user_id: null }).in('id', toClear);
    return 0;
  }

  const toClaim = rows.filter(r => r.user_id !== account.id).map(r => r.id);
  if (toClaim.length) await svc.from('borrowers').update({ user_id: account.id }).in('id', toClaim);
  return rows.length;
}

/**
 * Drop links on records this account holds whose email no longer matches the
 * account's own. Used after an account's email changes.
 */
export async function releaseMismatchedLinks(svc: SupabaseClient, userId: string, accountEmail: string): Promise<void> {
  const email = String(accountEmail || '').trim().toLowerCase();
  const { data: held } = await svc.from('borrowers').select('id, email').eq('user_id', userId);
  const stale = (held ?? []).filter(r => String(r.email || '').trim().toLowerCase() !== email).map(r => r.id);
  if (stale.length) await svc.from('borrowers').update({ user_id: null }).in('id', stale);
}
