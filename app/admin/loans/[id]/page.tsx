import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import LoanDetail from '@/components/LoanDetail';

export const dynamic = 'force-dynamic';

export default async function LoanPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  const { data: summary } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!summary) notFound();
  const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', params.id).order('draw_date', { ascending: true });
  const { data: payments } = await supabase.from('payments')
    .select('id, payment_date, amount, method, note').eq('loan_id', params.id).order('payment_date', { ascending: true });
  const { data: allocations } = await supabase.from('payment_allocations')
    .select('payment_id, period_month, amount').eq('loan_id', params.id);

  // Fallback ordering for Prev/Next when the dashboard's own order isn't in
  // this browser (direct link, or a fresh session).
  const { data: allLoans } = await supabase
    .from('loan_summary').select('loan_id, loan_number, borrower_name').order('loan_number');
  const fallbackOrder = (allLoans ?? []).map((l: any) => ({
    id: l.loan_id, label: `${l.loan_number} · ${l.borrower_name}`,
  }));
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  const role = profile?.role;
  return (
    <LoanDetail
      summary={summary}
      draws={draws ?? []}
      payments={payments ?? []}
      allocations={allocations ?? []}
      fallbackOrder={fallbackOrder}
      canEdit={role === 'admin'}
      canSend={role === 'admin' || role === 'staff'}
    />
  );
}
