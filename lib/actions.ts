'use server';

import { revalidatePath } from 'next/cache';
import { serverClient, serviceClient } from '@/lib/supabase-server';

async function requireAdmin() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Admin only');
  return supabase;
}

async function requireStaffOrAdmin() {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'staff'].includes(profile.role)) throw new Error('Staff or admin only');
  return supabase;
}

function nextLoanNumber(existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = /^L(\d+)$/i.exec(String(id).trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'L' + String(max + 1).padStart(3, '0');
}

async function upsertBorrower(supabase: any, name: string, email: string, phone: string): Promise<string> {
  const { data: existing } = await supabase.from('borrowers').select('id').eq('name', name).maybeSingle();
  if (existing) {
    await supabase.from('borrowers').update({ email: email || null, phone: phone || null }).eq('id', existing.id);
    return existing.id;
  }
  const { data: nb, error } = await supabase.from('borrowers')
    .insert({ name, email: email || null, phone: phone || null }).select('id').single();
  if (error) throw new Error(error.message);
  return nb.id;
}

async function upsertLender(supabase: any, name: string): Promise<string | null> {
  if (!name) return null;
  const { data: existing } = await supabase.from('lenders').select('id').eq('name', name).maybeSingle();
  if (existing) return existing.id;
  const { data: nl, error } = await supabase.from('lenders').insert({ name }).select('id').single();
  if (error) throw new Error(error.message);
  return nl.id;
}

export async function createLoan(form: FormData) {
  const supabase = await requireAdmin();
  const borrowerName = String(form.get('borrower_name') || '').trim();
  if (!borrowerName) throw new Error('Borrower name is required');

  const borrowerId = await upsertBorrower(
    supabase, borrowerName,
    String(form.get('borrower_email') || '').trim(),
    String(form.get('borrower_phone') || '').trim()
  );
  const lenderId = await upsertLender(supabase, String(form.get('lender_name') || '').trim());

  const loanAmount = Number(form.get('loan_amount') || 0);
  const acquisition = Number(form.get('acquisition') || 0);
  const construction = Math.max(0, loanAmount - acquisition); // derived

  const { data: nums } = await supabase.from('loans').select('loan_number');
  const loanNumber = nextLoanNumber((nums ?? []).map((r: any) => r.loan_number));

  const { error } = await supabase.from('loans').insert({
    loan_number: loanNumber,
    borrower_id: borrowerId,
    lender_id: lenderId,
    property: String(form.get('property') || '').trim(),
    loan_amount: loanAmount,
    acquisition,
    construction,
    annual_rate: Number(form.get('annual_rate') || 0) / 100,
    closing_date: String(form.get('closing_date') || ''),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function updateLoan(loanId: string, form: FormData) {
  const supabase = await requireAdmin();

  // Update borrower fields on the loan's borrower record.
  const { data: loan } = await supabase.from('loans').select('borrower_id').eq('id', loanId).single();
  if (loan?.borrower_id) {
    await supabase.from('borrowers').update({
      name: String(form.get('borrower_name') || '').trim(),
      email: String(form.get('borrower_email') || '').trim() || null,
      phone: String(form.get('borrower_phone') || '').trim() || null,
    }).eq('id', loan.borrower_id);
  }

  const lenderId = await upsertLender(supabase, String(form.get('lender_name') || '').trim());
  const loanAmount = Number(form.get('loan_amount') || 0);
  const acquisition = Number(form.get('acquisition') || 0);
  const construction = Math.max(0, loanAmount - acquisition);

  const { error } = await supabase.from('loans').update({
    lender_id: lenderId,
    property: String(form.get('property') || '').trim(),
    loan_amount: loanAmount,
    acquisition,
    construction,
    annual_rate: Number(form.get('annual_rate') || 0) / 100,
    closing_date: String(form.get('closing_date') || ''),
    updated_at: new Date().toISOString(),
  }).eq('id', loanId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
  revalidatePath(`/admin/loans/${loanId}`);
}

export async function deleteLoan(loanId: string) {
  const supabase = await requireAdmin();
  // draws cascade on delete; do it explicitly for clarity, then the loan.
  await supabase.from('draws').delete().eq('loan_id', loanId);
  await supabase.from('payments').delete().eq('loan_id', loanId);
  const { error } = await supabase.from('loans').delete().eq('id', loanId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin');
}

export async function addDraw(loanId: string, form: FormData) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('draws').insert({
    loan_id: loanId,
    draw_date: String(form.get('draw_date') || ''),
    description: String(form.get('description') || 'Construction Draw').trim() || 'Construction Draw',
    amount: Number(form.get('amount') || 0),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/loans/${loanId}`);
  revalidatePath('/admin');
}

export async function deleteDraw(loanId: string, drawId: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('draws').delete().eq('id', drawId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/loans/${loanId}`);
  revalidatePath('/admin');
}

export async function setLoanStatus(loanId: string, status: string) {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('loans').update({ status }).eq('id', loanId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/loans/${loanId}`);
  revalidatePath('/admin');
}

export async function setUserRole(userId: string, role: 'admin' | 'staff' | 'borrower') {
  const supabase = await requireAdmin();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/users');
}

export async function importLoansCSV(rows: Record<string, string>[]) {
  const supabase = await requireAdmin();
  const results: { loan: string; status: string }[] = [];
  const { data: nums } = await supabase.from('loans').select('loan_number');
  let existingNums = (nums ?? []).map((r: any) => r.loan_number);

  for (const row of rows) {
    try {
      const borrowerName = (row['Borrower'] || row['borrower'] || '').trim();
      if (!borrowerName) { results.push({ loan: '(blank)', status: 'skipped - no borrower' }); continue; }

      const borrowerId = await upsertBorrower(supabase, borrowerName, '', '');
      const lenderId = await upsertLender(supabase, (row['Lender'] || row['lender'] || '').trim());

      const num = (row['Loan ID'] || row['loan_number'] || '').trim() || nextLoanNumber(existingNums);
      existingNums.push(num);

      const rate = parseFloat(String(row['Interest Rate'] || row['annual_rate'] || '0').replace('%', ''));
      const loanAmount = parseFloat(String(row['Loan Amount'] || '0').replace(/[^0-9.\-]/g, '')) || 0;
      const acquisition = parseFloat(String(row['Acquisition'] || '0').replace(/[^0-9.\-]/g, '')) || 0;
      const construction = Math.max(0, loanAmount - acquisition);

      const { error } = await supabase.from('loans').insert({
        loan_number: num,
        borrower_id: borrowerId,
        lender_id: lenderId,
        property: (row['Property'] || row['Address'] || '').trim(),
        loan_amount: loanAmount,
        acquisition,
        construction,
        annual_rate: rate > 1 ? rate / 100 : rate,
        closing_date: (row['Closing Date'] || row['closing_date'] || '').trim(),
      });
      results.push({ loan: num, status: error ? `error: ${error.message}` : 'imported' });
    } catch (e: any) {
      results.push({ loan: '(row)', status: `error: ${e.message}` });
    }
  }
  revalidatePath('/admin');
  return results;
}

/**
 * Add an ADMIN or STAFF user. Two modes:
 *  - invite: Supabase emails them a set-password link
 *  - manual: create with a temp password; optionally email the credentials
 */
export async function inviteAdminUser(opts: {
  email: string; fullName: string; role: 'admin' | 'staff';
  mode: 'invite' | 'manual'; tempPassword?: string; emailCredentials?: boolean;
}) {
  await requireAdmin();
  const svc = serviceClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';
  let userId: string | undefined;
  let message = '';

  if (opts.mode === 'invite') {
    const { data, error } = await svc.auth.admin.inviteUserByEmail(opts.email, {
      redirectTo: site ? `${site}/auth/callback?next=/` : undefined,
      data: { full_name: opts.fullName },
    });
    if (error) throw new Error(error.message);
    userId = data?.user?.id;
    message = `Invitation emailed to ${opts.email}.`;
  } else {
    const { data, error } = await svc.auth.admin.createUser({
      email: opts.email, password: opts.tempPassword, email_confirm: true,
      user_metadata: { full_name: opts.fullName },
    });
    if (error) throw new Error(error.message);
    userId = data?.user?.id;
    message = `Account created for ${opts.email}.`;
    if (opts.emailCredentials) {
      await emailCredentials(opts.email, opts.fullName, opts.tempPassword!, site);
      message += ' Login details were emailed to them.';
    }
  }

  if (userId) {
    await svc.from('profiles').upsert({
      id: userId, email: opts.email, full_name: opts.fullName || null, role: opts.role,
    }, { onConflict: 'id' });
  }
  revalidatePath('/admin/users');
  return { ok: true, message };
}

/**
 * Add a BORROWER login for a specific loan's borrower, and link the borrower
 * record to the new auth user so row-level security lets them see their loan.
 */
export async function createBorrowerUser(opts: {
  loanId: string; borrowerId: string; email: string; fullName: string;
  mode: 'invite' | 'manual'; tempPassword?: string; emailCredentials?: boolean;
}) {
  await requireStaffOrAdmin();
  const svc = serviceClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL || '';
  let userId: string | undefined;
  let message = '';

  if (opts.mode === 'invite') {
    const { data, error } = await svc.auth.admin.inviteUserByEmail(opts.email, {
      redirectTo: site ? `${site}/auth/callback?next=/portal` : undefined,
      data: { full_name: opts.fullName },
    });
    if (error) throw new Error(error.message);
    userId = data?.user?.id;
    message = `Invitation emailed to ${opts.email}.`;
  } else {
    const { data, error } = await svc.auth.admin.createUser({
      email: opts.email, password: opts.tempPassword, email_confirm: true,
      user_metadata: { full_name: opts.fullName },
    });
    if (error) throw new Error(error.message);
    userId = data?.user?.id;
    message = `Borrower account created for ${opts.email}.`;
    if (opts.emailCredentials) {
      await emailCredentials(opts.email, opts.fullName, opts.tempPassword!, site);
      message += ' Login details were emailed to them.';
    }
  }

  if (userId) {
    await svc.from('profiles').upsert({
      id: userId, email: opts.email, full_name: opts.fullName || null, role: 'borrower',
    }, { onConflict: 'id' });
    // Link borrower record -> auth user (RLS: borrower sees only their loans).
    await svc.from('borrowers').update({ user_id: userId, email: opts.email }).eq('id', opts.borrowerId);
  }
  revalidatePath(`/admin/loans/${opts.loanId}`);
  revalidatePath('/admin/users');
  return { ok: true, message };
}

/** Shared: email a newly-created user their temporary login credentials. */
async function emailCredentials(email: string, fullName: string, tempPassword: string, site: string) {
  const nodemailer = (await import('nodemailer')).default;
  const host = process.env.SMTP_HOST, user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass) throw new Error('SMTP is not configured (SMTP_HOST, SMTP_USER, SMTP_PASS).');
  const t = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const from = process.env.SMTP_FROM || user;
  const loginUrl = site || '';
  const navy = '#1F3864', muted = '#6B7A90';
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
      <div style="color:${navy};font-weight:800;letter-spacing:.04em;font-size:18px;margin-bottom:4px">JAY CAPITAL</div>
      <div style="height:3px;background:${navy};border-radius:2px;margin:8px 0 20px"></div>
      <p style="margin:0 0 14px">Hi ${fullName || 'there'},</p>
      <p style="margin:0 0 14px">An account has been created for you on the Jay Capital portal. Here are your temporary login details:</p>
      <table style="margin:0 0 16px"><tr><td style="padding:4px 12px 4px 0;color:${muted}">Email</td><td style="font-weight:700">${email}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:${muted}">Temporary password</td><td style="font-weight:700">${tempPassword}</td></tr></table>
      ${loginUrl ? `<p style="margin:0 0 14px"><a href="${loginUrl}/login" style="background:${navy};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Sign in</a></p>` : ''}
      <p style="margin:0 0 14px;color:${muted};font-size:13px">Please sign in and change your password. If you have any questions, just reply to this email.</p>
    </div></body></html>`;
  await t.sendMail({ from: `Jay Capital <${from}>`, to: email, replyTo: from, subject: 'Your Jay Capital login', html });
}
