import Link from 'next/link';
import { serverClient, serviceClient } from '@/lib/supabase-server';
import { money, fmtDate, pct, fmtDateTime, todayInAppTz } from '@/lib/format';
import { buildLedger, chargeForPeriod, periodsThrough, pastDueAsOf } from '@/lib/ledger';
import { firstOfMonth } from '@/lib/format';
import InsightsCharts from '@/components/InsightsCharts';
import ActivityFeed from '@/components/ActivityFeed';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Admin insights. Everything here comes from our own database, so it works
 * regardless of which Vercel plan the project is on and needs no third-party
 * analytics script.
 *
 * Two halves: what the book is doing (money), and whether borrowers are
 * actually using the portal (engagement).
 */
export default async function InsightsPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  if (me?.role !== 'admin' && me?.role !== 'staff') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin or staff only.</div></div></div>;
  }

  const svc = serviceClient();

  const [{ data: loans }, { data: draws }, { data: payments }, { data: allocations },
         { data: borrowers }, { data: profiles }, { data: activity }] = await Promise.all([
    supabase.from('loan_summary').select('*'),
    svc.from('draws').select('loan_id, draw_date, amount, description'),
    svc.from('payments').select('id, loan_id, payment_date, amount, method, note'),
    svc.from('payment_allocations').select('payment_id, loan_id, period_month, amount'),
    svc.from('borrowers').select('id, name, email, user_id'),
    svc.from('profiles').select('id, email, full_name, role, active'),
    svc.from('portal_activity').select('id, kind, loan_id, user_id, occurred_at, detail')
       .order('occurred_at', { ascending: false }).limit(51),   // 50 + 1 to detect more
  ]);

  const loanList = loans ?? [];
  const drawList = draws ?? [];
  const payList = payments ?? [];
  const allocList = allocations ?? [];
  const actList = activity ?? [];

  const active = loanList.filter((l: any) => l.status === 'active');

  // ---- money
  const capital = active.reduce((s: number, l: any) => s + Number(l.loan_amount || 0), 0);
  const disbursed = active.reduce((s: number, l: any) => s + Number(l.total_disbursed || 0), 0);
  const undrawn = active.reduce((s: number, l: any) => s + Number(l.remaining_draw || 0), 0);
  const wRate = capital > 0
    ? active.reduce((s: number, l: any) => s + Number(l.annual_rate || 0) * Number(l.loan_amount || 0), 0) / capital
    : 0;

  // Billed vs collected across every loan, using the same ledger the
  // statements use, so these numbers agree with what borrowers were sent.
  const thisPeriod = firstOfMonth(todayInAppTz(), -1);
  let billed = 0, collected = 0, outstanding = 0;
  const overdue: { loan: any; amount: number; months: number; oldest: string }[] = [];

  for (const l of loanList) {
    const engineLoan = {
      loan_amount: Number(l.loan_amount), acquisition: Number(l.acquisition),
      annual_rate: Number(l.annual_rate), closing_date: l.closing_date,
    };
    const d = drawList.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ draw_date: x.draw_date, amount: Number(x.amount), description: x.description }));
    const p = payList.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ id: x.id, payment_date: x.payment_date, amount: Number(x.amount), method: x.method, note: x.note }));
    const a = allocList.filter((x: any) => x.loan_id === l.loan_id)
      .map((x: any) => ({ payment_id: x.payment_id, period_month: x.period_month, amount: Number(x.amount) }));

    for (const per of periodsThrough(l.closing_date, thisPeriod)) {
      billed += chargeForPeriod(engineLoan, d, per);
    }
    collected += p.reduce((s, x) => s + x.amount, 0);

    const led = buildLedger(engineLoan, d, p, a, firstOfMonth(todayInAppTz()));
    outstanding += Math.max(0, led.amountDue);

    // As of TODAY, not relative to a statement: a charge is late the moment
    // its due date passes, so the month just billed counts from the 1st.
    const late = pastDueAsOf(engineLoan, d, p, a, todayInAppTz());
    if (late.length) {
      overdue.push({
        loan: l,
        amount: late.reduce((s, r) => s + r.balance, 0),
        months: late.length,
        oldest: late[0].statementDate,
      });
    }
  }
  overdue.sort((a, b) => b.amount - a.amount);

  // ---- engagement
  const byId = new Map(loanList.map((l: any) => [l.loan_id, l]));
  const withLogin = (borrowers ?? []).filter((b: any) => b.user_id).length;
  const noLogin = (borrowers ?? []).filter((b: any) => !b.user_id);
  const staffCount = (profiles ?? []).filter((p: any) => p.role === 'admin' || p.role === 'staff').length;

  // Counted in the database rather than by loading the rows: the feed itself
  // is paged, so there is no full array to measure.
  const iso = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const [{ count: visits7 }, { count: visits30 }] = await Promise.all([
    svc.from('portal_activity').select('id', { count: 'exact', head: true }).gte('occurred_at', iso(7)),
    svc.from('portal_activity').select('id', { count: 'exact', head: true }).gte('occurred_at', iso(30)),
  ]);

  // Visit counts per month for the chart, aggregated in the database.
  const sixMonthsAgo = firstOfMonth(todayInAppTz(), -5);
  const { data: visitRows } = await svc.from('portal_activity')
    .select('occurred_at').gte('occurred_at', sixMonthsAgo).limit(50000);
  const visitsByMonth = new Map<string, number>();
  for (const v of visitRows ?? []) {
    const k = String(v.occurred_at).slice(0, 8) + '01';
    visitsByMonth.set(k, (visitsByMonth.get(k) ?? 0) + 1);
  }

  // monthly series for the charts
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) months.push(firstOfMonth(todayInAppTz(), -i));
  const series = months.map(m => {
    const end = firstOfMonth(m, 1);
    return {
      label: new Date(m + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' }),
      draws: drawList.filter((d: any) => d.draw_date >= m && d.draw_date < end)
                     .reduce((s: number, d: any) => s + Number(d.amount), 0),
      payments: payList.filter((p: any) => p.payment_date >= m && p.payment_date < end)
                       .reduce((s: number, p: any) => s + Number(p.amount), 0),
      visits: visitsByMonth.get(m) ?? 0,
    };
  });

  const lenderRows = Object.values(
    active.reduce((acc: any, l: any) => {
      const k = l.lender_short_name || l.lender_name || 'Unassigned';
      acc[k] = acc[k] || { name: k, count: 0, amount: 0 };
      acc[k].count++; acc[k].amount += Number(l.loan_amount || 0);
      return acc;
    }, {})
  ) as { name: string; count: number; amount: number }[];
  lenderRows.sort((a, b) => b.amount - a.amount);

  const kindLabel: Record<string, string> = {
    portal_view: 'Portal', statement_view: 'Statement link', pdf_download: 'PDF download',
  };

  // Who did it. Only signed-in portal views carry a user; statement links and
  // PDF downloads authenticate by token, so nobody is identified there --
  // anyone holding the link could have opened it.
  const accountById = new Map(
    (profiles ?? []).map((p: any) => [p.id, { email: p.email as string, name: p.full_name as string | null, role: p.role as string }])
  );

  return (
    <div className="wrap">
      <p style={{ marginBottom: 12 }}><Link href="/admin">&larr; Back to Dashboard</Link></p>
      <h1 className="title">Insights</h1>
      <div className="rule" />

      <div className="kpis">
        <div className="kpi"><div className="label">Active Loans</div><div className="value">{active.length}</div></div>
        <div className="kpi"><div className="label">Capital Committed</div><div className="value">{money(capital)}</div></div>
        <div className="kpi"><div className="label">Disbursed</div><div className="value">{money(disbursed)}</div></div>
        <div className="kpi"><div className="label">Undrawn</div><div className="value">{money(undrawn)}</div></div>
        <div className="kpi"><div className="label">Weighted Rate</div><div className="value">{pct(wRate)}</div></div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="label">Interest Billed (all time)</div><div className="value">{money(billed)}</div></div>
        <div className="kpi"><div className="label">Payments Received</div><div className="value">{money(collected)}</div></div>
        <div className="kpi"><div className="label">Currently Outstanding</div><div className="value">{money(outstanding)}</div></div>
        <div className="kpi"><div className="label">Collection Rate</div><div className="value">{billed > 0 ? ((collected / billed) * 100).toFixed(1) + '%' : '—'}</div></div>
      </div>

      <InsightsCharts series={series} />

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Past Due</h2>
        {overdue.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Nothing is past due. Every charge that has come due has been settled.</p>
        ) : (
          <table className="bordered">
            <thead><tr><th>Borrower</th><th>Property</th><th>Due Since</th><th className="num">Months Open</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {overdue.map(o => (
                <tr key={o.loan.loan_id}>
                  <td><Link href={`/admin/loans/${o.loan.loan_id}`}>{o.loan.borrower_name}</Link></td>
                  <td>{o.loan.property}</td>
                  <td>{fmtDate(o.oldest)}</td>
                  <td className="num">{o.months}</td>
                  <td className="num">{money(o.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="kpis" style={{ marginTop: 20 }}>
        <div className="kpi"><div className="label">Borrowers With A Login</div><div className="value">{withLogin}</div></div>
        <div className="kpi"><div className="label">Without A Login</div><div className="value">{noLogin.length}</div></div>
        <div className="kpi"><div className="label">Portal Visits (7d)</div><div className="value">{visits7 ?? 0}</div></div>
        <div className="kpi"><div className="label">Portal Visits (30d)</div><div className="value">{visits30 ?? 0}</div></div>
        <div className="kpi"><div className="label">Admin / Staff</div><div className="value">{staffCount}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 }}>
        <div className="card">
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Borrowers Without Portal Access</h2>
          {noLogin.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>Every borrower has an account.</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>These borrowers have never set up a login.</p>
              <table className="bordered">
                <thead><tr><th>Borrower</th><th>Email</th></tr></thead>
                <tbody>
                  {noLogin.slice(0, 12).map((b: any) => (
                    <tr key={b.id}><td>{b.name}</td><td>{b.email || <span className="muted">none on file</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="card">
          <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Exposure by Lender</h2>
          <table className="bordered">
            <thead><tr><th>Lender</th><th className="num">Loans</th><th className="num">Committed</th><th className="num">Share</th></tr></thead>
            <tbody>
              {lenderRows.map(r => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{money(r.amount)}</td>
                  <td className="num">{capital > 0 ? ((r.amount / capital) * 100).toFixed(1) + '%' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ color: 'var(--navy)', marginTop: 0 }}>Recent Activity</h2>
        <ActivityFeed
          initialRows={actList.slice(0, 50) as any}
          initialHasMore={actList.length > 50}
          loans={loanList.map((l: any) => ({ loan_id: l.loan_id, loan_number: l.loan_number, borrower_name: l.borrower_name }))}
          accounts={(profiles ?? []).map((p: any) => ({ id: p.id, email: p.email, name: p.full_name, role: p.role }))}
        />

        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          All activity, newest first, loaded as you scroll. Times are New York time.
          Logged server-side: what was opened and when, with no IP address, device or
          location tracking.
        </p>
      </div>
    </div>
  );
}
