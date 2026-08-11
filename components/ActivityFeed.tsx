'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchActivityPage } from '@/lib/activity-actions';
import { fmtDateTime } from '@/lib/format';

export interface ActivityRow {
  id: number;
  kind: string;
  loan_id: string | null;
  user_id: string | null;
  occurred_at: string;
}

export interface ActivityLoan { loan_id: string; loan_number: string; borrower_name: string }
export interface ActivityAccount { id: string; email: string; name: string | null; role: string }

const PAGE_SIZE = 50;

const KIND_LABEL: Record<string, string> = {
  portal_view: 'Opened portal',
  pdf_download: 'Downloaded PDF',
  statement_month: 'Viewed statement',
  sign_in: 'Signed in',
  account_created: 'Created account',
  email_changed: 'Changed email',
  statement_emailed: 'Statement emailed',
  statement_view: 'Statement link',
};

/**
 * All recorded activity, in a fixed-height scrollable panel.
 *
 * Rows arrive a page at a time as you scroll, so the query cost stays flat
 * however much history builds up -- portal_activity only grows, and every
 * borrower view adds to it.
 */
export default function ActivityFeed({
  initialRows, initialHasMore, loans, accounts,
}: {
  initialRows: ActivityRow[];
  initialHasMore: boolean;
  loans: ActivityLoan[];
  accounts: ActivityAccount[];
}) {
  const [rows, setRows] = useState<ActivityRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const sentinel = useRef<HTMLDivElement | null>(null);

  // Mirrors of state, so loadMore can stay identity-stable.
  const rowsRef = useRef(rows);
  const hasMoreRef = useRef(hasMore);
  rowsRef.current = rows;
  hasMoreRef.current = hasMore;

  const loanById = new Map(loans.map(l => [l.loan_id, l]));
  const accountById = new Map(accounts.map(a => [a.id, a]));

  // Guard against overlapping fetches. State updates are async, so `loading`
  // alone can let two observer callbacks through in the same tick.
  const inFlight = useRef(false);

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMoreRef.current) return;
    inFlight.current = true;
    setLoading(true); setErr('');

    const oldest = rowsRef.current[rowsRef.current.length - 1]?.occurred_at;
    const res = await fetchActivityPage({ before: oldest, limit: PAGE_SIZE });

    setLoading(false);
    inFlight.current = false;

    if (!res.ok) {
      setErr(res.error || 'Could not load more activity.');
      setHasMore(false);
      return;
    }
    // run() merges the action's object result to the top level, so the rows
    // arrive as res.rows, NOT res.data.
    const next = res.rows ?? [];
    setRows(r => {
      // Belt and braces against a duplicated page if two calls did overlap.
      const seen = new Set(r.map(x => x.id));
      return [...r, ...next.filter(x => !seen.has(x.id))];
    });
    setHasMore(!!res.hasMore);
  }, []);

  // Fetch the next page when the bottom of the list scrolls into view.
  // loadMore is stable (it reads through refs), so the observer is created
  // once and is not torn down on every page -- which would risk missing the
  // moment the sentinel comes into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) void loadMore(); },
      { root: el.closest('.activity-scroll'), rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // If a page arrives and the sentinel is still on screen -- a tall window, or
  // a short page -- keep going rather than waiting for a scroll that will not
  // come.
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinel.current;
    const root = el?.closest('.activity-scroll');
    if (!el || !root) return;
    const r = root.getBoundingClientRect();
    const s = el.getBoundingClientRect();
    if (s.top <= r.bottom + 200) void loadMore();
  }, [rows, hasMore, loading, loadMore]);

  if (rows.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No activity recorded yet.
      </p>
    );
  }

  return (
    <>
      <div className="activity-scroll tablescroll">
        <table className="bordered">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Loan</th></tr></thead>
          <tbody>
            {rows.map(a => {
              const l = a.loan_id ? loanById.get(a.loan_id) : null;
              const acct = a.user_id ? accountById.get(a.user_id) : null;
              return (
                <tr key={a.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.occurred_at)}</td>
                  <td>
                    {acct ? (
                      <>
                        <div style={{ fontWeight: 600 }}>{acct.name || acct.email}</div>
                        {acct.name && <div className="muted" style={{ fontSize: 12 }}>{acct.email}</div>}
                        {acct.role !== 'borrower' && <span className={`badge ${acct.role}`}>{acct.role}</span>}
                      </>
                    ) : a.user_id ? (
                      <span className="muted">deleted account</span>
                    ) : (
                      <span className="muted">&mdash;</span>
                    )}
                  </td>
                  <td>{KIND_LABEL[a.kind] || a.kind}</td>
                  <td>
                    {l
                      ? <Link href={`/admin/loans/${l.loan_id}`}>{l.loan_number} &middot; {l.borrower_name}</Link>
                      : <span className="muted">&mdash;</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div ref={sentinel} style={{ height: 1 }} />

        {loading && <p className="muted" style={{ textAlign: 'center', padding: '12px 0', margin: 0 }}>Loading more…</p>}
        {err && <div className="alert error" style={{ margin: 10 }}>{err}</div>}
        {!hasMore && !loading && (
          <p className="muted" style={{ textAlign: 'center', padding: '10px 0', margin: 0, fontSize: 12 }}>
            That&rsquo;s everything &mdash; {rows.length} record{rows.length === 1 ? '' : 's'}.
          </p>
        )}
      </div>

      {/* Scrolling loads the next page on its own; this is only a fallback for
          browsers without IntersectionObserver, or if a fetch failed. */}
      {hasMore && !loading && (
        <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => void loadMore()}>
          Load more
        </button>
      )}
    </>
  );
}
