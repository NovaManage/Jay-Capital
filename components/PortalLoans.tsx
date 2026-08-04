'use client';

import { useEffect, useState } from 'react';
import StatementView, { type StatementData, type StatementDraw, type PayInfo } from '@/components/StatementView';
import { money, shortAddress } from '@/lib/format';
import type { PaymentRow, AllocationRow } from '@/lib/ledger';

export interface PortalLoan {
  loan: StatementData;
  draws: StatementDraw[];
  payments: PaymentRow[];
  allocations: AllocationRow[];
  payInfo: PayInfo | null;
}

/**
 * The borrower's loans as tabs. With one loan the tab strip is hidden, so a
 * single-loan borrower sees no extra chrome.
 *
 * The selected tab is remembered per user id, so signing back in returns to
 * the loan they were last looking at.
 */
export default function PortalLoans({
  loans, userId, userEmail,
}: { loans: PortalLoan[]; userId: string; userEmail: string }) {
  const key = `jcf:portal:lastLoan:${userId}`;
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);

  // Restore after mount: reading storage during render would not match the
  // server-rendered markup.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const i = loans.findIndex(l => l.loan.loan_id === saved);
        if (i >= 0) setActive(i);
      }
    } catch { /* storage unavailable; first tab is fine */ }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans.length, userId]);

  useEffect(() => {
    if (!ready) return;
    try {
      const id = loans[active]?.loan.loan_id;
      if (id) window.localStorage.setItem(key, id);
    } catch { /* ignore */ }
  }, [active, ready, loans, key]);

  if (loans.length === 0) {
    return (
      <>
        <div className="wrap"><div className="card">
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>No loans found</h2>
          <p>
            We couldn&apos;t find any loans registered to <b>{userEmail}</b>.
          </p>
          <p className="muted">
            Loans are matched by the email address on file for them. If your loan was
            registered under a different address, update it below — otherwise contact us
            and we&apos;ll get it sorted.
          </p>
          <p className="muted" style={{ marginTop: 16 }}>
            Use <b>Change my email</b> at the top of the page to switch to the address
            your loan is registered under.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <a className="btn secondary" style={{ textDecoration: 'none' }}
               href="mailto:Yossi@JayCapitalFunding.com?subject=Portal%20access%20help">Email us</a>
            <a className="btn secondary" style={{ textDecoration: 'none' }} href="tel:+18458280731">Call (845) 828-0731</a>
          </div>
        </div></div>
      </>
    );
  }

  const current = loans[active] ?? loans[0];
  const multi = loans.length > 1;

  return (
    <>
      <div className="wrap" style={{ maxWidth: 960, paddingBottom: 0 }}>
        {multi && (
          <div className="loantabs" role="tablist" aria-label="Your loans">
            {loans.map((l, i) => (
              <button
                key={l.loan.loan_id}
                role="tab"
                aria-selected={i === active}
                className={`loantab ${i === active ? 'active' : ''}`}
                onClick={() => setActive(i)}
              >
                <span className="loantab-addr">{shortAddress(l.loan.property)}</span>
                <span className="loantab-meta">
                  {l.loan.loan_number} · {money(l.loan.loan_amount)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <StatementView
        key={current.loan.loan_id}
        loan={current.loan}
        draws={current.draws}
        payments={current.payments}
        allocations={current.allocations}
        payInfo={current.payInfo}
        flushTop={multi}
      />
    </>
  );
}
