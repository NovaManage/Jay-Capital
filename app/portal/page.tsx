import { serverClient } from '@/lib/supabase-server';
import StatementView from '@/components/StatementView';
import PortalTitle from '@/components/PortalTitle';
import LiveRefresh from '@/components/LiveRefresh';
import Logo from '@/components/Logo';
import { fetchStatementExtras } from '@/lib/statement-data';
import { borrowerDisplayName } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function PortalPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: loans } = await supabase.from('loan_summary').select('*').order('loan_number');

  const borrowerName = loans && loans.length ? borrowerDisplayName(loans[0]) : '';

  const Nav = (
    <nav className="nav">
      <Logo size={34} /><span className="spacer" />
      <span className="muted" style={{ fontSize: 13 }}>{user?.email}</span>
      <form action="/auth/signout" method="post" style={{ margin: 0 }}>
        <button className="btn secondary">Sign out</button>
      </form>
    </nav>
  );

  if (!loans || loans.length === 0) {
    return (
      <>
        <PortalTitle name="" />
        {Nav}
        <div className="wrap"><div className="card">
          <p className="muted">No loans are linked to your account yet. Please contact Jay Capital.</p>
        </div></div>
      </>
    );
  }

  const drawsByLoan: Record<string, any[]> = {};
  const extrasByLoan: Record<string, any> = {};
  for (const loan of loans) {
    const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', loan.loan_id).order('draw_date');
    drawsByLoan[loan.loan_id] = draws ?? [];
    extrasByLoan[loan.loan_id] = await fetchStatementExtras(loan.loan_id);
  }

  return (
    <>
      <PortalTitle name={borrowerName} />
      <LiveRefresh />
      {Nav}
      {loans.map((loan: any) => (
        <StatementView
          key={loan.loan_id} loan={loan} draws={drawsByLoan[loan.loan_id]}
          payments={extrasByLoan[loan.loan_id]?.payments}
          allocations={extrasByLoan[loan.loan_id]?.allocations}
          payInfo={extrasByLoan[loan.loan_id]?.payInfo}
        />
      ))}
    </>
  );
}
