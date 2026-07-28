import { serviceClient } from '@/lib/supabase-server';
import StatementView from '@/components/StatementView';
import PortalTitle from '@/components/PortalTitle';

export const dynamic = 'force-dynamic';

export default async function StatementPage({ params }: { params: { token: string } }) {
  const supabase = serviceClient();
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('access_token', params.token).maybeSingle();
  if (!loan) {
    return (<div className="wrap" style={{ maxWidth: 640 }}><div className="card"><p>Statement not found. Please check your link or contact us.</p></div></div>);
  }
  const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', loan.loan_id).order('draw_date', { ascending: true });
  return (
    <>
      <PortalTitle name={loan.borrower_name} />
      <StatementView loan={loan} draws={draws ?? []} />
    </>
  );
}
