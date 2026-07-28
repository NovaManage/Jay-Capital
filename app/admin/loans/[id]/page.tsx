import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import LoanDetail from '@/components/LoanDetail';

export const dynamic = 'force-dynamic';

export default async function LoanPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  const { data: summary } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!summary) notFound();
  const { data: draws } = await supabase.from('draw_details').select('*').eq('loan_id', params.id).order('draw_date', { ascending: true });
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  const role = profile?.role;
  return (
    <LoanDetail
      summary={summary}
      draws={draws ?? []}
      canEdit={role === 'admin'}
      canSend={role === 'admin' || role === 'staff'}
    />
  );
}
