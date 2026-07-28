import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  redirect(profile?.role === 'borrower' ? '/portal' : '/admin');
}
