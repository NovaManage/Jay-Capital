import { serverClient } from '@/lib/supabase-server';
import PortfolioTable from '@/components/PortfolioTable';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const supabase = serverClient();

  const { data: loans, error } = await supabase
    .from('loan_summary')
    .select('*')
    .order('loan_number', { ascending: true });

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
        loans={loans ?? []}
        canEdit={profile?.role === 'admin'}
      />
    </div>
  );
}
