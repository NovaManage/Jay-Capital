import { serverClient } from '@/lib/supabase-server';
import NewLoanForm from '@/components/NewLoanForm';

export const dynamic = 'force-dynamic';

export default async function NewLoanPage() {
  const supabase = serverClient();
  const { data: lenders } = await supabase
    .from('lenders').select('id, name, active').order('name');
  return <NewLoanForm lenders={lenders ?? []} />;
}
