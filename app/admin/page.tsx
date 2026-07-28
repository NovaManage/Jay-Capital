import { serverClient } from '@/lib/supabase-server';
import PortfolioTable from '@/components/PortfolioTable';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = serverClient();

  const { data: loans, error } = await supabase
    .from('loan_summary')
    .select('*')
    .order('loan_number', { ascending: true });

  const { data: loanRows } = await supabase.from('loans').select('id, lender_id');
  const { data: lenderRows } = await supabase.from('lenders').select('id, name, short_name');
  const shortById = new Map((lenderRows ?? []).map((l: any) => [l.id, l.short_name || l.name]));
  const shortByLoan = new Map((loanRows ?? []).map((l: any) => [l.id, shortById.get(l.lender_id) ?? null]));

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .single();

  if (error) {
    return (
      <div className="wrap">
        <div className="card">
          <div className="alert error">Could not load loans: {error.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1 className="title">Hard Money Loan Portfolio</h1>
      <div className="rule" />
      <PortfolioTable
        loans={(loans ?? []).map((l: any) => ({ ...l, lender_short_name: shortByLoan.get(l.loan_id) ?? null }))}
        canEdit={profile?.role === 'admin'}
      />
    </div>
  );
}
