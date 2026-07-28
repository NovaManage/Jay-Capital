import Link from 'next/link';
import { serverClient } from '@/lib/supabase-server';
import LenderManager from '@/components/LenderManager';

export const dynamic = 'force-dynamic';

export default async function LendersPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  if (me?.role !== 'admin') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin only.</div></div></div>;
  }

  const { data: lenders } = await supabase.from('lenders').select('id, name, active').order('name');
  const { data: loans } = await supabase.from('loans').select('lender_id');

  const counts = new Map<string, number>();
  for (const l of loans ?? []) {
    if (l.lender_id) counts.set(l.lender_id, (counts.get(l.lender_id) ?? 0) + 1);
  }
  const rows = (lenders ?? []).map((l: any) => ({ ...l, loan_count: counts.get(l.id) ?? 0 }));

  return (
    <div className="wrap">
      <p style={{ marginBottom: 12 }}><Link href="/admin">&larr; Back to Dashboard</Link></p>
      <div className="card">
        <h1 className="title">Lenders</h1>
        <div className="rule" />
        <p className="muted">
          Lenders here populate the dropdown on new and edited loans. Inactivating one
          keeps it on existing loans but removes it from the list of choices.
        </p>
        <LenderManager lenders={rows} />
      </div>
    </div>
  );
}
