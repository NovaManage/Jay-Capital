import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase-server';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';

/**
 * Post-sign-in router. `/` is the public marketing page now, so signing in
 * can no longer just land there -- this sends each role where it belongs.
 */
export default async function GoPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, activated_at').eq('id', user.id).single();

  // Every session passes through here right after sign-in.
  await logActivity('sign_in', null, user.id);

  // First arrival is what turns an invitation into a live account.
  const now = new Date().toISOString();
  await supabase.from('profiles')
    .update(profile?.activated_at ? { last_seen_at: now } : { activated_at: now, last_seen_at: now })
    .eq('id', user.id);
  redirect(profile?.role === 'admin' || profile?.role === 'staff' ? '/admin' : '/portal');
}
