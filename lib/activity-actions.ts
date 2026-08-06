'use server';

import { run } from '@/lib/result';
import { serverClient } from '@/lib/supabase-server';

/**
 * A page of recent activity for the admin insights feed.
 *
 * Paged rather than fetched whole: this table only grows, and every borrower
 * view adds a row. Loading a month of it in one go would get slower every
 * week for a list that only ever shows twenty-odd rows at a time.
 */
export async function fetchActivityPage(opts: {
  before?: string | null;   // ISO cursor: fetch rows older than this
  days?: number;
  limit?: number;
} = {}) {
  return run(async () => {
    const supabase = serverClient();

    // Staff-only: the RLS policy on portal_activity already enforces this,
    // but fail fast rather than returning an empty page that looks like
    // "no activity".
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
    if (me?.role !== 'admin' && me?.role !== 'staff') throw new Error('Admin or staff only.');

    const days = opts.days ?? 30;
    const limit = Math.min(opts.limit ?? 25, 100);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    let q = supabase.from('portal_activity')
      .select('id, kind, loan_id, user_id, occurred_at')
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(limit + 1);           // one extra tells us whether more remain

    if (opts.before) q = q.lt('occurred_at', opts.before);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    return { rows: rows.slice(0, limit), hasMore };
  });
}
