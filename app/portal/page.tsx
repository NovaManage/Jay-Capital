import { serverClient } from '@/lib/supabase-server';
import PortalTitle from '@/components/PortalTitle';
import LiveRefresh from '@/components/LiveRefresh';
import Logo from '@/components/Logo';
import PortalLoans, { type PortalLoan } from '@/components/PortalLoans';
import { fetchStatementExtras } from '@/lib/statement-data';
import { borrowerDisplayName } from '@/lib/format';
import { logActivity } from '@/lib/activity';
import ChangeEmailButton from '@/components/ChangeEmailButton';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function PortalPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Read as the signed-in user, never the service role: row level security is
  // what guarantees a borrower only ever sees their own loans.
  const { data: loans } = await supabase.from('loan_summary').select('*').order('loan_number');
  const list = loans ?? [];

  const borrowerName = list.length ? borrowerDisplayName(list[0]) : '';

  const Nav = (
    <nav className="nav nav-borrower">
      <Logo size={40} />
      <span className="spacer" />
      <span className="muted" style={{ fontSize: 13 }}>{user?.email}</span>
      <ChangeEmailButton userEmail={user?.email ?? ''} />
      <form action="/auth/signout" method="post" style={{ margin: 0 }}>
        <button className="btn secondary">Sign out</button>
      </form>
    </nav>
  );

  if (list.length) await logActivity('portal_view', list[0].loan_id, user?.id ?? null);

  const items: PortalLoan[] = [];
  for (const loan of list) {
    const { data: draws } = await supabase
      .from('draw_details').select('*').eq('loan_id', loan.loan_id).order('draw_date');
    const extras = await fetchStatementExtras(loan.loan_id, { requireUserAccess: true });
    items.push({
      loan, draws: draws ?? [],
      payments: extras.payments, allocations: extras.allocations, payInfo: extras.payInfo,
    });
  }

  return (
    <>
      <PortalTitle name={borrowerName} />
      <LiveRefresh />
      {Nav}
      <PortalLoans loans={items} userId={user?.id ?? ''} userEmail={user?.email ?? ''} />
    </>
  );
}
