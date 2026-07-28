import { serverClient } from '@/lib/supabase-server';
import { notFound } from 'next/navigation';
import EditLoanForm from '@/components/EditLoanForm';

export const dynamic = 'force-dynamic';

export default async function EditLoanPage({ params }: { params: { id: string } }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  if (me?.role !== 'admin') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin only.</div></div></div>;
  }
  const { data: loan } = await supabase.from('loan_summary').select('*').eq('loan_id', params.id).single();
  if (!loan) notFound();
  const { data: row } = await supabase.from('loans').select('lender_id').eq('id', params.id).maybeSingle();
  const { data: lenders } = await supabase.from('lenders').select('id, name, active').order('name');
  return <EditLoanForm loan={{ ...loan, lender_id: row?.lender_id ?? null }} lenders={lenders ?? []} />;
}
