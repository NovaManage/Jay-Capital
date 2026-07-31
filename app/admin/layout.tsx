import { redirect } from 'next/navigation';
import Link from 'next/link';
import { serverClient } from '@/lib/supabase-server';
import LiveRefresh from '@/components/LiveRefresh';
import Logo from '@/components/Logo';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/admin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single();

  const role = profile?.role ?? 'borrower';

  // Borrowers don't belong in the admin area -- send them to their portal.
  if (role === 'borrower') redirect('/portal');

  const isAdmin = role === 'admin';

  return (
    <>
      <LiveRefresh />
      <nav className="nav">
        <Link href="/admin" style={{ textDecoration: 'none', padding: 0 }}><Logo size={34} /></Link>
        <Link href="/admin">Portfolio</Link>
        {isAdmin && <Link href="/admin/loans/new">New Loan</Link>}
        {isAdmin && <Link href="/admin/import">Import</Link>}
        {isAdmin && <Link href="/admin/lenders">Lenders</Link>}
        {isAdmin && <Link href="/admin/users">Users</Link>}
        <span className="spacer" />
        <span className={`badge ${role}`}>{role}</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {profile?.full_name || profile?.email}
        </span>
        <form action="/auth/signout" method="post" style={{ margin: 0 }}>
          <button className="btn secondary" type="submit">Sign out</button>
        </form>
      </nav>
      {children}
    </>
  );
}
