'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ORDER_KEY } from '@/components/PortfolioTable';

/**
 * Step through loans from the loan page.
 *
 * Follows the order the dashboard is actually showing -- same filters, same
 * sort -- which the table publishes to localStorage. If that isn't available
 * (fresh browser, or the loan was opened from a direct link) it falls back to
 * the full list in loan-number order, passed in from the server.
 */
export default function LoanPager({
  currentId, fallbackOrder,
}: { currentId: string; fallbackOrder: { id: string; label: string }[] }) {
  const [order, setOrder] = useState<string[]>(() => fallbackOrder.map(l => l.id));
  const [fromDashboard, setFromDashboard] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ORDER_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        // Only trust it if it still contains this loan, otherwise the filters
        // have moved on and stepping through it would jump somewhere odd.
        if (Array.isArray(ids) && ids.includes(currentId)) {
          setOrder(ids);
          setFromDashboard(true);
        }
      }
    } catch { /* fall back to the server list */ }
  }, [currentId]);

  const labelById = new Map(fallbackOrder.map(l => [l.id, l.label]));
  const i = order.indexOf(currentId);
  if (i === -1 || order.length < 2) return null;

  const prev = i > 0 ? order[i - 1] : null;
  const next = i < order.length - 1 ? order[i + 1] : null;

  const btn = (id: string | null, text: string, title: string | undefined) =>
    id ? (
      <Link className="btn secondary" href={`/admin/loans/${id}`} title={title} prefetch={false}>
        {text}
      </Link>
    ) : (
      <button className="btn secondary" disabled>{text}</button>
    );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {btn(prev, '← Previous', prev ? labelById.get(prev) : undefined)}
      <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
        {i + 1} of {order.length}{fromDashboard ? '' : ' (all loans)'}
      </span>
      {btn(next, 'Next →', next ? labelById.get(next) : undefined)}
    </div>
  );
}
