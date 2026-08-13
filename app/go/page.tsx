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

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  // activated_at / last_seen_at are stamped by a trigger on auth.users
  // (migration 007). Doing it here failed silently for everyone but an admin,
  // because profiles_admin_write blocks a user writing their own row.
  await logActivity('sign_in', null, user.id, profile?.role ? `Role: ${profile.role}` : null);
  redirect(profile?.role === 'admin' || profile?.role === 'staff' ? '/admin' : '/portal');
}
