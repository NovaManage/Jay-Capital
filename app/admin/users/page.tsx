import { serverClient } from '@/lib/supabase-server';
import Link from 'next/link';
import UserRowControls from '@/components/UserRowControls';
import InviteUser from '@/components/InviteUser';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user?.id ?? '').single();
  if (me?.role !== 'admin') {
    return <div className="wrap"><div className="card"><div className="alert error">Admin only.</div></div></div>;
  }
  const { data: profiles } = await supabase
    .from('profiles').select('id, email, full_name, role, active').order('email');

  return (
    <div className="wrap">
      <p style={{ marginBottom: 12 }}><Link href="/admin">&larr; Back to Dashboard</Link></p>
      <div className="card">
        <h1 className="title">Users &amp; Roles</h1>
        <div className="rule" />
        <InviteUser />
        <p className="muted">
          Admins manage everything. Staff have read-only access and can send statements.
          Borrowers see only their own loans. To add a borrower login, open that
          borrower&apos;s loan and use &ldquo;Add borrower login.&rdquo; Inactivating a user blocks
          sign-in without deleting anything.
        </p>
        <div className="tablescroll">
          <table className="bordered">
            <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(profiles ?? []).map((p: any) => (
                <tr key={p.id}>
                  <td>{p.email}</td>
                  <td>{p.full_name ?? ''}</td>
                  <td><span className={`badge ${p.role}`}>{p.role}</span></td>
                  <td><span className={`badge ${p.active === false ? 'borrower' : 'staff'}`}>{p.active === false ? 'inactive' : 'active'}</span></td>
                  <td>
                    <UserRowControls
                      user={{ id: p.id, email: p.email, full_name: p.full_name, role: p.role, active: p.active !== false }}
                      isSelf={p.id === user?.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
