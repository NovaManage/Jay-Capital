'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { money, pct, fmtDate, rateFraction, shortAddress } from '@/lib/format';

export interface LoanRow {
  loan_id: string;
  loan_number: string;
  borrower_name: string;
  property: string;
  loan_amount: number;
  acquisition: number;
  construction: number;
  annual_rate: number;
  closing_date: string;
  lender_name: string | null;
  lender_short_name?: string | null;
  total_disbursed: number;
  remaining_draw: number;
  accrued_interest: number;
  total_draw?: number;
  status: string;
  access_token: string;
}

type SortKey = keyof LoanRow;

/** Dashboard view state, and the loan order the loan page pages through. */
export const VIEW_KEY = 'jcf:admin:portfolioView';
export const ORDER_KEY = 'jcf:admin:loanOrder';

const COLUMNS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'loan_number',      label: 'Loan ID' },
  { key: 'borrower_name',    label: 'Borrower' },
  { key: 'property',         label: 'Property' },
  { key: 'loan_amount',      label: 'Loan Amount',     num: true },
  { key: 'acquisition',      label: 'Acquisition',     num: true },
  { key: 'construction',     label: 'Construction',    num: true },
  { key: 'annual_rate',      label: 'Interest Rate',   num: true },
  { key: 'closing_date',     label: 'Closing Date' },
  { key: 'lender_name',      label: 'Lender' },
  { key: 'total_disbursed',  label: 'Total Disbursed', num: true },
  { key: 'total_draw',       label: 'Total Draw',      num: true },
  { key: 'remaining_draw',   label: 'Remaining Draw',  num: true },
  { key: 'status',           label: 'Status' },
];

export default function PortfolioTable({ loans, canEdit }: { loans: LoanRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [lender, setLender] = useState('');
  const [rateBand, setRateBand] = useState('');
  const [status, setStatus] = useState('active');
  const [sortKey, setSortKey] = useState<SortKey | null>('loan_number');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [restored, setRestored] = useState(false);

  // Restore the last search, filters and sort. Opening a loan and coming back
  // used to drop you on the defaults, so a filter had to be re-set every time.
  // Read after mount, never during render -- the server has no localStorage,
  // and reading it during render would not match the server-rendered markup.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIEW_KEY);
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.q === 'string') setQ(v.q);
        if (typeof v.lender === 'string') setLender(v.lender);
        if (typeof v.rateBand === 'string') setRateBand(v.rateBand);
        if (typeof v.status === 'string') setStatus(v.status);
        if (v.sortKey === null || typeof v.sortKey === 'string') setSortKey(v.sortKey);
        if (v.sortDir === 1 || v.sortDir === -1) setSortDir(v.sortDir);
      }
    } catch { /* corrupt or unavailable: defaults are fine */ }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;   // don't overwrite saved state with the defaults
    try {
      window.localStorage.setItem(VIEW_KEY, JSON.stringify({ q, lender, rateBand, status, sortKey, sortDir }));
    } catch { /* ignore */ }
  }, [restored, q, lender, rateBand, status, sortKey, sortDir]);

  const lenders = useMemo(
    () => Array.from(new Set(loans.map(l => l.lender_name).filter(Boolean))).sort() as string[],
    [loans]
  );

  const view = useMemo(() => {
    const withDraw = loans.map(l => ({
      ...l,
      total_draw: Number(l.total_disbursed || 0) - Number(l.acquisition || 0),
    }));
    let rows = withDraw.filter(l => {
      if (status && l.status !== status) return false;
      if (lender && l.lender_name !== lender) return false;
      if (rateBand) {
        const [lo, hi] = rateBand.split('-').map(Number);
        const r = rateFraction(l.annual_rate) * 100;
        if (!(r >= lo && r < hi)) return false;
      }
      if (q) {
        const hay = [
          l.loan_number, l.borrower_name, l.property, l.lender_name, l.lender_short_name,
          fmtDate(l.closing_date), l.loan_amount, l.acquisition, l.construction,
          (rateFraction(l.annual_rate) * 100).toFixed(2),
          l.total_disbursed, l.total_draw, l.remaining_draw, l.status,
        ].join(' ').toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });

    if (sortKey) {
      const col = COLUMNS.find(c => c.key === sortKey);
      rows = [...rows].sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        if (col?.num) return ((Number(x) || 0) - (Number(y) || 0)) * sortDir;
        return String(x ?? '').localeCompare(String(y ?? '')) * sortDir;
      });
    }
    return rows;
  }, [loans, q, lender, rateBand, status, sortKey, sortDir]);

  const kpis = useMemo(() => {
    const capital = view.reduce((s, l) => s + Number(l.loan_amount || 0), 0);
    const weighted = view.reduce((s, l) => s + rateFraction(l.annual_rate) * Number(l.loan_amount || 0), 0);
    const deployed = view.reduce((s, l) => s + Number(l.total_disbursed || 0), 0);
    const totalDraw = view.reduce((s, l) => s + Number(l.total_draw || 0), 0);
    return {
      capital, count: view.length,
      rate: capital > 0 ? weighted / capital : 0,
      deployed, totalDraw,
    };
  }, [view]);

  // Publish the order actually on screen, so Prev/Next on a loan follows the
  // list the admin is looking at rather than some unrelated global order.
  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(ORDER_KEY, JSON.stringify(view.map(l => l.loan_id)));
    } catch { /* ignore */ }
  }, [restored, view]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  }

  function exportCSV() {
    const head = COLUMNS.map(c => c.label);
    const lines = [head.join(',')];
    view.forEach(l => {
      const row = COLUMNS.map(c => {
        let v: any = l[c.key];
        if (c.key === 'annual_rate') v = (rateFraction(l.annual_rate) * 100).toFixed(2) + '%';
        if (c.key === 'closing_date') v = fmtDate(l.closing_date);
        v = String(v ?? '');
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      });
      lines.push(row.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jay_capital_portfolio_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="label">Total Capital</div><div className="value">{money(kpis.capital)}</div></div>
        <div className="kpi"><div className="label">Total Disbursed</div><div className="value">{money(kpis.deployed)}</div></div>
        <div className="kpi"><div className="label">Active Loans</div><div className="value">{kpis.count}</div></div>
        <div className="kpi"><div className="label">Weighted Avg Rate</div><div className="value">{pct(kpis.rate)}</div></div>
        <div className="kpi"><div className="label">Total Draw</div><div className="value">{money(kpis.totalDraw)}</div></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search borrower, property, lender, ID, amount…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select className="filter" value={lender} onChange={e => setLender(e.target.value)}>
            <option value="">All Lenders</option>
            {lenders.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select className="filter" value={rateBand} onChange={e => setRateBand(e.target.value)}>
            <option value="">All Rates</option>
            <option value="0-8">Under 8%</option>
            <option value="8-10">8% &ndash; 10%</option>
            <option value="10-100">Over 10%</option>
          </select>
          <select className="filter" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="paid_off">Paid off</option>
            <option value="defaulted">Defaulted</option>
            <option value="">All statuses</option>
          </select>
          <button className="btn" onClick={exportCSV}>Export CSV</button>
          {(q || lender || rateBand || status !== 'active') && (
            <button
              className="btn secondary"
              onClick={() => { setQ(''); setLender(''); setRateBand(''); setStatus('active'); }}
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="tablescroll">
          <table className="bordered">
            <thead>
              <tr>
                {COLUMNS.map(c => (
                  <th
                    key={String(c.key)}
                    data-key={String(c.key)}
                    className={[c.num ? 'num' : '', sortKey === c.key ? (sortDir === 1 ? 'sort-asc' : 'sort-desc') : ''].join(' ').trim()}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map(l => (
                <tr
                  key={l.loan_id}
                  className="clickable"
                  onClick={() => router.push(`/admin/loans/${l.loan_id}`)}
                >
                  <td>{l.loan_number}</td>
                  <td>{l.borrower_name}</td>
                  <td>{shortAddress(l.property)}</td>
                  <td className="num">{money(l.loan_amount)}</td>
                  <td className="num">{money(l.acquisition)}</td>
                  <td className="num">{money(l.construction)}</td>
                  <td className="num">{pct(l.annual_rate)}</td>
                  <td>{fmtDate(l.closing_date)}</td>
                  <td>{l.lender_short_name || l.lender_name || ''}</td>
                  <td className="num">{money(l.total_disbursed)}</td>
                  <td className="num">{money(l.total_draw)}</td>
                  <td className="num">{money(l.remaining_draw)}</td>
                  <td>{l.status.replace('_', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {view.length === 0 && (
          <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
            No loans match your filters.
          </p>
        )}
      </div>
    </>
  );
}
