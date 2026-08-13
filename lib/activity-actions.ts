'use server';

import { run } from '@/lib/result';
import { serverClient } from '@/lib/supabase-server';

export interface ActivityPageRow {
  id: number;
  kind: string;
  loan_id: string | null;
  user_id: string | null;
  occurred_at: string;
  detail: string | null;
}

/**
 * What fetchActivityPage resolves to.
 *
 * run() MERGES a plain object result up to the top level rather than nesting
 * it under `data`, so these fields sit alongside `ok`. Reading res.data here
 * silently yields undefined -- which is exactly what stopped the feed after
 * the first page.
 */
export interface ActivityPageResult {
  ok: boolean;
  error?: string;
  rows?: ActivityPageRow[];
  hasMore?: boolean;
}

/**
 * A page of recent activity for the admin insights feed.
 *
 * Covers all history. Paged rather than fetched whole: this table only grows
 * and every borrower view adds a row, so loading it all at once would get
 * slower every week for a list that only ever shows a screenful. Paging keeps
 * the cost flat no matter how much history accumulates.
 */
export async function fetchActivityPage(opts: {
  before?: string | null;   // ISO cursor: fetch rows older than this
  limit?: number;
} = {}): Promise<ActivityPageResult> {
  return run(async () => {
    const supabase = serverClient();

    // Staff-only: the RLS policy on portal_activity already enforces this,
    // but fail fast rather than returning an empty page that looks like
    // "no activity".
    const { data: { user } } = await supabase.auth.getUser();
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
    if (me?.role !== 'admin' && me?.role !== 'staff') throw new Error('Admin or staff only.');

    const limit = Math.min(opts.limit ?? 50, 200);

    let q = supabase.from('portal_activity')
      .select('id, kind, loan_id, user_id, occurred_at, detail')
      .order('occurred_at', { ascending: false })
      .limit(limit + 1);           // one extra tells us whether more remain

    if (opts.before) q = q.lt('occurred_at', opts.before);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    // Merged to the top level by run(); see ActivityPageResult.
    return { rows: rows.slice(0, limit), hasMore };
  });
}
