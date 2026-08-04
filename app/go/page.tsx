import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Post-sign-in router. `/` is the public marketing page now, so signing in
 * can no longer just land there -- this sends each role where it belongs.
 */
export default async function GoPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  redirect(profile?.role === 'admin' || profile?.role === 'staff' ? '/admin' : '/portal');
}
