import { serviceClient } from '@/lib/supabase-server';
import StatementView from '@/components/StatementView';
import PortalTitle from '@/components/PortalTitle';
import ClaimAccountCard from '@/components/ClaimAccountCard';
import LiveRefresh from '@/components/LiveRefresh';
import { fetchStatementExtras } from '@/lib/statement-data';
import { borrowerDisplayName } from '@/lib/format';
import Logo from '@/components/Logo';
import { logActivity, currentUserIdOrNull } from '@/lib/activity';
import EmailUs from '@/components/EmailUs';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function StatementPage({ params }: { params: { token: string } }) {
  const supabase = serviceClient();
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('access_token', params.token).maybeSingle();
  if (!loan) {
    return (
      <>
        <nav className="nav nav-borrower">
          <a href="/" style={{ textDecoration: 'none', padding: 0 }}><Logo size={40} /></a>
        </nav>
        <div className="wrap" style={{ maxWidth: 640 }}>
          <div className="card">
            <p style={{ marginTop: 0 }}>Statement not found. Please check your link, or get in touch.</p>
            <EmailUs subject="Statement link" />
          </div>
        </div>
      </>
    );
  }
  const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', loan.loan_id).order('draw_date', { ascending: true });

  // Offer self-setup only when this borrower has no login yet and we have an
  // address on file to create it against.
  const { data: borrower } = await supabase
    .from('borrowers').select('user_id').eq('id', loan.borrower_id).maybeSingle();
  const canClaim = !!loan.borrower_email && !borrower?.user_id;
  const extras = await fetchStatementExtras(loan.loan_id);
  await logActivity('statement_view', loan.loan_id, await currentUserIdOrNull());

  return (
    <>
      <PortalTitle name={borrowerDisplayName(loan)} />
      <LiveRefresh />
      <nav className="nav nav-borrower">
        <a href="/" style={{ textDecoration: 'none', padding: 0 }}><Logo size={40} /></a>
        <span className="spacer" />
        <EmailUs subject="Statement question" label="Contact us" />
      </nav>
      {canClaim && <ClaimAccountCard token={params.token} email={loan.borrower_email} />}
      <StatementView
        loan={loan} draws={draws ?? []}
        payments={extras.payments} allocations={extras.allocations} payInfo={extras.payInfo}
      />
    </>
  );
}
