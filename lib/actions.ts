'use server';

import { run } from '@/lib/result';
import { revalidatePath } from 'next/cache';
import { serverClient, serviceClient } from '@/lib/supabase-server';
import { syncBorrowerLinksForEmail } from '@/lib/borrower-links';
import { randomBytes } from 'crypto';
import { sendMail, brandShell, button, rawLink } from '@/lib/mailer';
import { assertStrongPassword } from '@/lib/password';
import { logActivity } from '@/lib/activity';
import { money as fmtMoney } from '@/lib/format';

/** The signed-in user's id, for attributing an admin action. */
async function actorId(): Promise<string | null> {
  try {
    const { data: { user } } = await serverClient().auth.getUser();
    return user?.id ?? null;
  } catch { return null; }
}

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

/**
 * Look up an auth user by email. The admin API has no direct
 * get-by-email, so page through listUsers and match case-insensitively.
 */
async function findUserByEmail(svc: any, email: string): Promise<{ id: string } | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u: any) => String(u.email ?? '').toLowerCase() === target);
    if (hit) return { id: hit.id };
    if (users.length < 200) break;
  }
  return null;
}

/**
 * Point every borrower record for this email at the same login, so one
 * borrower with several loans sees all of them in their portal.
 * RLS reads `borrower_id in (select id from borrowers where user_id = auth.uid())`,
 * which is already plural-safe -- it just needs the rows linked.
 * Returns how many records were linked.
 */
async function linkBorrowerRecords(
  svc: any, userId: string, email: string, borrowerId: string,
): Promise<number> {
  await svc.from('borrowers').update({ user_id: userId, email }).eq('id', borrowerId);

  // Any other borrower record with the same email that has no login yet.
  const { data: siblings } = await svc.from('borrowers')
    .select('id').ilike('email', email).is('user_id', null);
  const ids = (siblings ?? []).map((r: any) => r.id).filter((id: string) => id !== borrowerId);
  if (ids.length) await svc.from('borrowers').update({ user_id: userId }).in('id', ids);

  return 1 + ids.length;
}

async function upsertLender(supabase: any, name: string): Promise<string | null> {
  if (!name) return null;
  const { data: existing } = await supabase.from('lenders').select('id, active').ilike('name', name).maybeSingle();
  if (existing) {
    if (!existing.active) await supabase.from('lenders').update({ active: true }).eq('id', existing.id);
    return existing.id;
  }
  const { data: nl, error } = await supabase.from('lenders').insert({ name }).select('id').single();
  if (error) throw new Error(error.message);
  return nl.id;
}

/** Lender comes from the dropdown (lender_id) or a newly typed name. */
async function resolveLenderId(supabase: any, form: FormData): Promise<string | null> {
  const newName = String(form.get('lender_new_name') || '').trim();
  if (newName) return await upsertLender(supabase, newName);
  const id = String(form.get('lender_id') || '').trim();
  return id || null;
}

/** Everything except the borrower phone is mandatory on a loan. */
function requireLoanFields(form: FormData, lenderId: string | null) {
  const need: [string, string][] = [
    ['borrower_name', 'Borrower name'],
    ['borrower_email', 'Borrower email'],
    ['property', 'Property address'],
    ['loan_amount', 'Loan amount'],
    ['acquisition', 'Acquisition'],
    ['annual_rate', 'Interest rate'],
    ['closing_date', 'Closing date'],
  ];
  const missing = need.filter(([k]) => !String(form.get(k) || '').trim()).map(([, label]) => label);
  if (!lenderId) missing.push('Lender');
  if (String(form.get('is_entity') || '') === 'on' && !String(form.get('entity_name') || '').trim()) {
    missing.push('Entity name');
  }
  if (missing.length) {
    throw new Error(`Please fill in: ${missing.join(', ')}.`);
  }
}

export async function createLoan(form: FormData) {
  return run(async () => {
    const supabase = await requireAdmin();
    const lenderId = await resolveLenderId(supabase, form);
    requireLoanFields(form, lenderId);

    const borrowerName = String(form.get('borrower_name') || '').trim();
    const borrowerId = await upsertBorrower(
      supabase, borrowerName,
      String(form.get('borrower_email') || '').trim(),
      String(form.get('borrower_phone') || '').trim()
    );

    const loanAmount = Number(form.get('loan_amount') || 0);
    const acquisition = Number(form.get('acquisition') || 0);
    const construction = Math.max(0, loanAmount - acquisition); // derived

    const { data: nums } = await supabase.from('loans').select('loan_number');
    const loanNumber = nextLoanNumber((nums ?? []).map((r: any) => r.loan_number));

    const isEntity = String(form.get('is_entity') || '') === 'on';
    const { error } = await supabase.from('loans').insert({
      loan_number: loanNumber,
      borrower_id: borrowerId,
      lender_id: lenderId,
      is_entity: isEntity,
      entity_name: isEntity ? String(form.get('entity_name') || '').trim() : null,
      property: String(form.get('property') || '').trim(),
      loan_amount: loanAmount,
      acquisition,
      construction,
      annual_rate: Number(form.get('annual_rate') || 0) / 100,
      closing_date: String(form.get('closing_date') || ''),
    });
    if (error) throw new Error(error.message);
    await logActivity('loan_created', null, await actorId(),
      `${loanNumber} · ${borrowerName} · ${String(form.get('property') || '').trim()} · ${fmtMoney(loanAmount)}`);
    revalidatePath('/admin');
  });
}

export async function updateLoan(loanId: string, form: FormData) {
  return run(async () => {
    const supabase = await requireAdmin();

    // Update borrower fields on the loan's borrower record.
    const { data: loan } = await supabase.from('loans').select('borrower_id').eq('id', loanId).single();
    const newEmail = String(form.get('borrower_email') || '').trim();
    if (loan?.borrower_id) {
      const { data: before } = await supabase.from('borrowers').select('email').eq('id', loan.borrower_id).maybeSingle();

      await supabase.from('borrowers').update({
        name: String(form.get('borrower_name') || '').trim(),
        email: newEmail || null,
        phone: String(form.get('borrower_phone') || '').trim() || null,
      }).eq('id', loan.borrower_id);

      // Changing the email changes who owns the loan. Re-point the account
      // link for BOTH addresses, so the old account loses access and the new
      // one gains it, instead of the link silently going stale.
      const oldEmail = String(before?.email || '').trim();
      if (oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
        const svc = serviceClient();
        if (oldEmail) await syncBorrowerLinksForEmail(svc, oldEmail);
        if (newEmail) await syncBorrowerLinksForEmail(svc, newEmail);
      }
    }

    const lenderId = await resolveLenderId(supabase, form);
    requireLoanFields(form, lenderId);
    const loanAmount = Number(form.get('loan_amount') || 0);
    const acquisition = Number(form.get('acquisition') || 0);
    const construction = Math.max(0, loanAmount - acquisition);

    const isEntity = String(form.get('is_entity') || '') === 'on';
    const { error } = await supabase.from('loans').update({
      lender_id: lenderId,
      is_entity: isEntity,
      entity_name: isEntity ? String(form.get('entity_name') || '').trim() : null,
      property: String(form.get('property') || '').trim(),
      loan_amount: loanAmount,
      acquisition,
      construction,
      annual_rate: Number(form.get('annual_rate') || 0) / 100,
      closing_date: String(form.get('closing_date') || ''),
      updated_at: new Date().toISOString(),
    }).eq('id', loanId);
    if (error) throw new Error(error.message);
    await logActivity('loan_updated', loanId, await actorId(),
      `${String(form.get('borrower_name') || '').trim()} · ${String(form.get('property') || '').trim()}`);
    revalidatePath('/admin');
    revalidatePath(`/admin/loans/${loanId}`);
  });
}

export async function deleteLoan(loanId: string) {
  return run(async () => {
    const supabase = await requireAdmin();
    const { data: gone } = await supabase.from('loan_summary')
      .select('loan_number, borrower_name, property').eq('loan_id', loanId).maybeSingle();
    // draws cascade on delete; do it explicitly for clarity, then the loan.
    await supabase.from('draws').delete().eq('loan_id', loanId);
    await supabase.from('payments').delete().eq('loan_id', loanId);
    const { error } = await supabase.from('loans').delete().eq('id', loanId);
    if (error) throw new Error(error.message);
    await logActivity('loan_deleted', null, await actorId(),
      gone ? `${gone.loan_number} · ${gone.borrower_name} · ${gone.property}` : loanId);
    revalidatePath('/admin');
  });
}

export async function addDraw(loanId: string, form: FormData) {
  return run(async () => {
    const supabase = await requireAdmin();
    const { error } = await supabase.from('draws').insert({
      loan_id: loanId,
      draw_date: String(form.get('draw_date') || ''),
      description: String(form.get('description') || 'Construction Draw').trim() || 'Construction Draw',
      amount: Number(form.get('amount') || 0),
    });
    if (error) throw new Error(error.message);
    await logActivity('draw_added', loanId, await actorId(),
      `${fmtMoney(Number(form.get('amount') || 0))} dated ${String(form.get('draw_date') || '')}`);
    revalidatePath(`/admin/loans/${loanId}`);
    revalidatePath('/admin');
  });
}

export async function updateDraw(loanId: string, drawId: string, form: FormData) {
  return run(async () => {
    const supabase = await requireAdmin();
    const drawDate = String(form.get('draw_date') || '');
    const amount = Number(form.get('amount') || 0);
    if (!drawDate) throw new Error('Draw date is required.');
    if (!(amount > 0)) throw new Error('Draw amount must be greater than zero.');

    const { error } = await supabase.from('draws').update({
      draw_date: drawDate,
      amount,
      description: String(form.get('description') || 'Construction Draw').trim() || 'Construction Draw',
    }).eq('id', drawId);
    if (error) throw new Error(error.message);
    await logActivity('draw_updated', loanId, await actorId(),
      `${fmtMoney(amount)} dated ${drawDate}`);
    revalidatePath(`/admin/loans/${loanId}`);
    revalidatePath('/admin');
    return { message: 'Draw updated.' };
  });
}

export async function deleteDraw(loanId: string, drawId: string) {
  return run(async () => {
    const supabase = await requireAdmin();
    const { data: gone } = await supabase.from('draws')
      .select('draw_date, amount').eq('id', drawId).maybeSingle();
    const { error } = await supabase.from('draws').delete().eq('id', drawId);
    if (error) throw new Error(error.message);
    await logActivity('draw_deleted', loanId, await actorId(),
      gone ? `${fmtMoney(Number(gone.amount))} dated ${gone.draw_date}` : drawId);
    revalidatePath(`/admin/loans/${loanId}`);
    revalidatePath('/admin');
  });
}

export async function setLoanStatus(loanId: string, status: string) {
  return run(async () => {
    const supabase = await requireAdmin();
    const { error } = await supabase.from('loans').update({ status }).eq('id', loanId);
    if (error) throw new Error(error.message);
    await logActivity('loan_status_changed', loanId, await actorId(), `Set to ${status.replace('_', ' ')}`);
    revalidatePath(`/admin/loans/${loanId}`);
    revalidatePath('/admin');
  });
}

export async function setUserRole(userId: string, role: 'admin' | 'staff' | 'borrower') {
  return run(async () => {
    const supabase = await requireAdmin();
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/users');
  });
}

export async function importLoansCSV(rows: Record<string, string>[]) {
  return run(async () => {
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
    await logActivity('loans_imported', null, await actorId(),
      `${results.filter(r => r.status === 'imported').length} of ${rows.length} rows imported`);
    revalidatePath('/admin');
    return results;
  });
}

/* ============================================================
 * Lender management
 * ============================================================ */

export async function createLender(opts: {
  name: string; shortName?: string; paymentMethod?: string; paymentInstructions?: string;
}) {
  return run(async () => {
    await requireAdmin();
    const name = opts.name.trim();
    if (!name) throw new Error('Lender name is required.');
    const svc = serviceClient();

    const row = {
      name,
      short_name: (opts.shortName || '').trim() || name,
      payment_method: (opts.paymentMethod || '').trim() || null,
      payment_instructions: (opts.paymentInstructions || '').trim() || null,
    };

    const { data: existing } = await svc.from('lenders').select('id, active').ilike('name', name).maybeSingle();
    if (existing) {
      await svc.from('lenders').update({ ...row, active: true }).eq('id', existing.id);
      revalidatePath('/admin/lenders');
      return { message: `${name} already existed and has been updated${existing.active ? '.' : ' and reactivated.'}`, id: existing.id };
    }

    const { data, error } = await svc.from('lenders').insert(row).select('id').single();
    if (error) throw new Error(error.message);
    await logActivity('lender_added', null, await actorId(), name);
    revalidatePath('/admin/lenders');
    revalidatePath('/admin/loans/new');
    return { message: `${name} added.`, id: data.id };
  });
}

export async function updateLender(id: string, opts: {
  name: string; shortName?: string; paymentMethod?: string; paymentInstructions?: string;
}) {
  return run(async () => {
    await requireAdmin();
    const name = opts.name.trim();
    if (!name) throw new Error('Lender name is required.');
    const { error } = await serviceClient().from('lenders').update({
      name,
      short_name: (opts.shortName || '').trim() || name,
      payment_method: (opts.paymentMethod || '').trim() || null,
      payment_instructions: (opts.paymentInstructions || '').trim() || null,
    }).eq('id', id);
    if (error) throw new Error(error.message);
    await logActivity('lender_updated', null, await actorId(), name);
    revalidatePath('/admin/lenders');
    revalidatePath('/admin');
    return { message: 'Lender updated.' };
  });
}

export async function setLenderActive(id: string, active: boolean) {
  return run(async () => {
    await requireAdmin();
    const svc = serviceClient();
    if (!active) {
      // Inactivating only hides it from NEW loans; existing loans keep it.
      const { count } = await svc.from('loans').select('id', { count: 'exact', head: true }).eq('lender_id', id);
      const { error } = await svc.from('lenders').update({ active: false }).eq('id', id);
      if (error) throw new Error(error.message);
      revalidatePath('/admin/lenders');
      return { message: count ? `Inactivated. ${count} existing loan(s) keep this lender; it just won't be offered on new loans.` : 'Lender inactivated.' };
    }
    const { error } = await svc.from('lenders').update({ active: true }).eq('id', id);
    if (error) throw new Error(error.message);
    revalidatePath('/admin/lenders');
    return { message: 'Lender reactivated.' };
  });
}

/* ============================================================
 * Payments
 * ============================================================ */

/**
 * Record a borrower payment and apply it to specific charge periods.
 * `allocations` is [{ periodMonth, amount }]; the total may be less than the
 * payment (the remainder shows on statements as unapplied) but never more.
 */
export async function addPayment(loanId: string, opts: {
  paymentDate: string; amount: number; method?: string; note?: string;
  allocations: { periodMonth: string; amount: number }[];
}) {
  return run(async () => {
    await requireAdmin();
    if (!opts.paymentDate) throw new Error('Payment date is required.');
    const amount = Number(opts.amount);
    if (!(amount > 0)) throw new Error('Payment amount must be greater than zero.');

    const allocs = (opts.allocations || []).filter(a => Number(a.amount) > 0);
    const allocTotal = allocs.reduce((s, a) => s + Number(a.amount), 0);
    if (allocTotal - amount > 0.005) {
      throw new Error('The amounts applied to charges add up to more than the payment.');
    }

    const svc = serviceClient();
    const { data: pay, error } = await svc.from('payments').insert({
      loan_id: loanId,
      payment_date: opts.paymentDate,
      amount,
      method: (opts.method || '').trim() || null,
      note: (opts.note || '').trim() || null,
    }).select('id').single();
    if (error) throw new Error(error.message);

    if (allocs.length) {
      const { error: aErr } = await svc.from('payment_allocations').insert(
        allocs.map(a => ({
          payment_id: pay.id, loan_id: loanId,
          period_month: a.periodMonth, amount: Number(a.amount),
        }))
      );
      if (aErr) throw new Error(aErr.message);
    }

    await logActivity('payment_added', loanId, await actorId(),
      `${fmtMoney(amount)} on ${opts.paymentDate}${opts.method ? ` by ${opts.method}` : ''}`
      + (allocs.length ? ` · applied to ${allocs.map(a => a.periodMonth).join(', ')}` : ' · unapplied'));

    revalidatePath(`/admin/loans/${loanId}`);
    revalidatePath('/admin');
    const left = amount - allocTotal;
    return {
      message: left > 0.005
        ? `Payment recorded. ${left.toFixed(2)} is not yet applied to a charge.`
        : 'Payment recorded.',
    };
  });
}

/** Edit a payment and replace its allocations wholesale. */
export async function updatePayment(loanId: string, paymentId: string, opts: {
  paymentDate: string; amount: number; method?: string; note?: string;
  allocations: { periodMonth: string; amount: number }[];
}) {
  return run(async () => {
    await requireAdmin();
    if (!opts.paymentDate) throw new Error('Payment date is required.');
    const amount = Number(opts.amount);
    if (!(amount > 0)) throw new Error('Payment amount must be greater than zero.');

    const allocs = (opts.allocations || []).filter(a => Number(a.amount) > 0);
    const allocTotal = allocs.reduce((s, a) => s + Number(a.amount), 0);
    if (allocTotal - amount > 0.005) {
      throw new Error('The amounts applied to charges add up to more than the payment.');
    }

    const svc = serviceClient();
    const { error } = await svc.from('payments').update({
      payment_date: opts.paymentDate,
      amount,
      method: (opts.method || '').trim() || null,
      note: (opts.note || '').trim() || null,
    }).eq('id', paymentId);
    if (error) throw new Error(error.message);

    const { error: dErr } = await svc.from('payment_allocations').delete().eq('payment_id', paymentId);
    if (dErr) throw new Error(dErr.message);

    if (allocs.length) {
      const { error: aErr } = await svc.from('payment_allocations').insert(
        allocs.map(a => ({
          payment_id: paymentId, loan_id: loanId,
          period_month: a.periodMonth, amount: Number(a.amount),
        }))
      );
      if (aErr) throw new Error(aErr.message);
    }

    await logActivity('payment_updated', loanId, await actorId(),
      `${fmtMoney(amount)} on ${opts.paymentDate}`);

    revalidatePath(`/admin/loans/${loanId}`);
    revalidatePath('/admin');
    const left = amount - allocTotal;
    return {
      message: left > 0.005
        ? `Payment updated. ${left.toFixed(2)} is not yet applied to a charge.`
        : 'Payment updated.',
    };
  });
}

export async function deletePayment(loanId: string, paymentId: string) {
  return run(async () => {
    await requireAdmin();
    const svc = serviceClient();
    const { data: gone } = await svc.from('payments')
      .select('payment_date, amount').eq('id', paymentId).maybeSingle();
    // allocations cascade on payment delete
    const { error } = await svc.from('payments').delete().eq('id', paymentId);
    if (error) throw new Error(error.message);
    await logActivity('payment_deleted', loanId, await actorId(),
      gone ? `${fmtMoney(Number(gone.amount))} dated ${gone.payment_date}` : paymentId);
    revalidatePath(`/admin/loans/${loanId}`);
    revalidatePath('/admin');
    return { message: 'Payment removed.' };
  });
}

/* ============================================================
 * User management
 * ============================================================ */

export async function updateUserProfile(userId: string, opts: { fullName: string; email: string; role: 'admin' | 'staff' | 'borrower' }) {
  return run(async () => {
    const supabase = await requireAdmin();
    const { data: { user: me } } = await supabase.auth.getUser();
    const svc = serviceClient();

    const email = opts.email.trim();
    if (!email) throw new Error('Email is required.');
    if (userId === me?.id && opts.role !== 'admin') {
      throw new Error("You can't change your own role away from admin.");
    }

    const { data: current } = await svc.from('profiles').select('email').eq('id', userId).maybeSingle();
    if (current && current.email !== email) {
      const { error } = await svc.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) throw new Error(error.message);
    }

    const { error } = await svc.from('profiles')
      .update({ email, full_name: opts.fullName.trim() || null, role: opts.role })
      .eq('id', userId);
    if (error) throw new Error(error.message);

    await logActivity('user_updated', null, await actorId(), `${email} · role ${opts.role}`);
    revalidatePath('/admin/users');
    return { message: 'User updated.' };
  });
}

/**
 * Send the set-password invitation again.
 *
 * Uses generateLink, so it works whether the original was never opened or has
 * expired -- Supabase recovery links are single-use and time-limited, and the
 * common support request is simply "I never got it".
 */
export async function resendInvitation(userId: string) {
  return run(async () => {
    await requireAdmin();
    const svc = serviceClient();
    const site = process.env.NEXT_PUBLIC_SITE_URL || '';

    const { data: profile } = await svc.from('profiles')
      .select('email, full_name, activated_at').eq('id', userId).maybeSingle();
    if (!profile?.email) throw new Error('That user has no email address on file.');

    const { data: link, error } = await svc.auth.admin.generateLink({
      type: 'recovery', email: profile.email,
      options: { redirectTo: site ? `${site}/auth/callback?next=/auth/set-password` : undefined },
    });
    if (error) throw new Error(error.message);
    const action = (link as any)?.properties?.action_link;
    if (!action) throw new Error('Could not generate the invitation link.');

    await sendMail({
      to: profile.email,
      subject: 'Set up your Jay Capital Funding account',
      html: brandShell(
        `<p style="margin:0 0 14px">Hi ${profile.full_name || 'there'},</p>
         <p style="margin:0 0 14px">Here is a fresh link to choose a password and finish setting up your Jay Capital Funding login.</p>
         ${button(action, 'Set my password')}
         ${rawLink(action)}
         <p style="margin:14px 0 0;color:#6B7A90;font-size:13px">This replaces any earlier link. If you weren&rsquo;t expecting it, you can ignore this email.</p>`
      ),
    });

    await svc.from('profiles').update({ invited_at: new Date().toISOString() }).eq('id', userId);
    await logActivity('user_invited', null, await actorId(), `Re-sent to ${profile.email}`);
    revalidatePath('/admin/users');
    return { message: `Invitation re-sent to ${profile.email}.` };
  });
}

export async function setUserActive(userId: string, active: boolean) {
  return run(async () => {
    const supabase = await requireAdmin();
    const { data: { user: me } } = await supabase.auth.getUser();
    if (userId === me?.id) throw new Error("You can't inactivate your own account.");

    const svc = serviceClient();
    // Banning is what actually stops them signing in; the flag is for display.
    const { error: authErr } = await svc.auth.admin.updateUserById(userId, {
      ban_duration: active ? 'none' : '876000h',   // ~100 years
    });
    if (authErr) throw new Error(authErr.message);

    const { error } = await svc.from('profiles').update({ active }).eq('id', userId);
    if (error) throw new Error(error.message);

    const { data: who } = await svc.from('profiles').select('email').eq('id', userId).maybeSingle();
    await logActivity('user_active_changed', null, await actorId(),
      `${who?.email ?? userId} ${active ? 'reactivated' : 'inactivated'}`);
    revalidatePath('/admin/users');
    return { message: active ? 'User reactivated. They can sign in again.' : 'User inactivated. They can no longer sign in.' };
  });
}

export async function sendUserPasswordReset(email: string) {
  return run(async () => {
    await requireAdmin();
    const site = process.env.NEXT_PUBLIC_SITE_URL || '';
    const svc = serviceClient();
    const { data, error } = await svc.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
      options: { redirectTo: site ? `${site}/auth/callback?next=/auth/set-password` : undefined },
    });
    if (error) throw new Error(error.message);

    const link = (data as any)?.properties?.action_link;
    if (!link) throw new Error('Supabase did not return a reset link.');

    await emailResetLink(email.trim(), link);
    await logActivity('password_reset_sent', null, await actorId(), email.trim());
    return { message: `Password reset link emailed to ${email.trim()}.` };
  });
}

export async function deleteUser(userId: string) {
  return run(async () => {
    const supabase = await requireAdmin();
    const { data: { user: me } } = await supabase.auth.getUser();
    if (userId === me?.id) throw new Error("You can't delete your own account.");

    const svc = serviceClient();
    // Unlink borrower records first so the loans survive the delete.
    await svc.from('borrowers').update({ user_id: null }).eq('user_id', userId);
    const { error } = await svc.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    await logActivity('user_deleted', null, await actorId(), userId);
    revalidatePath('/admin/users');
    return { message: 'User deleted. Their loans and borrower records were kept.' };
  });
}

/**
 * Create a user and email them a link to set their own password, entirely
 * over our SMTP.
 *
 * Replaces auth.admin.inviteUserByEmail, which sends through Supabase's
 * mailer -- different sender, no branding, and it spends the Supabase quota.
 * generateLink only RETURNS a link, so we create the account with an
 * unguessable throwaway password and mail the recovery link ourselves.
 */
async function createUserAndEmailInvite(
  svc: any, email: string, fullName: string, site: string, kind: 'team' | 'borrower',
): Promise<string> {
  const throwaway = randomBytes(24).toString('base64url');
  const { data, error } = await svc.auth.admin.createUser({
    email, password: throwaway, email_confirm: true,
    user_metadata: { full_name: fullName || null },
  });
  if (error) throw new Error(error.message);
  const userId: string | undefined = data?.user?.id;
  if (!userId) throw new Error('The account could not be created.');

  const { data: link, error: lErr } = await svc.auth.admin.generateLink({
    type: 'recovery', email,
    options: { redirectTo: site ? `${site}/auth/callback?next=/auth/set-password` : undefined },
  });
  if (lErr) throw new Error(lErr.message);
  const action = (link as any)?.properties?.action_link;
  if (!action) throw new Error('Could not generate the invitation link.');

  const intro = kind === 'borrower'
    ? 'An account has been created for you on the Jay Capital Funding borrower portal, where you can view your loan statements and construction draws.'
    : 'You have been given access to the Jay Capital Funding portal.';

  await svc.from('profiles').update({ invited_at: new Date().toISOString() }).eq('id', userId);
  await logActivity('user_invited', null, await actorId(), `${email} (${kind})`);

  await sendMail({
    to: email,
    subject: 'Set up your Jay Capital Funding account',
    html: brandShell(
      `<p style="margin:0 0 14px">Hi ${fullName || 'there'},</p>
       <p style="margin:0 0 14px">${intro} Choose a password to finish setting up your login.</p>
       ${button(action, 'Set my password')}
       ${rawLink(action)}
       <p style="margin:14px 0 0;color:#6B7A90;font-size:13px">If you weren&rsquo;t expecting this, you can ignore this email.</p>`
    ),
  });

  return userId;
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
  return run(async () => {
    await requireAdmin();
    const svc = serviceClient();
    const site = process.env.NEXT_PUBLIC_SITE_URL || '';
    let userId: string | undefined;
    let message = '';

    if (opts.mode === 'invite') {
      userId = await createUserAndEmailInvite(svc, opts.email, opts.fullName, site, 'team');
      message = `Invitation emailed to ${opts.email}.`;
    } else {
      // A temporary password is a real password until they change it.
      assertStrongPassword(opts.tempPassword || '', opts.email);
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
  });
}

/**
 * Add a BORROWER login for a specific loan's borrower, and link the borrower
 * record to the new auth user so row-level security lets them see their loan.
 */
export async function createBorrowerUser(opts: {
  loanId: string; borrowerId: string; email: string; fullName: string;
    mode: 'invite' | 'manual'; tempPassword?: string; emailCredentials?: boolean;
}) {
  return run(async () => {
    await requireStaffOrAdmin();
    const svc = serviceClient();
    const site = process.env.NEXT_PUBLIC_SITE_URL || '';
    let userId: string | undefined;
    let message = '';
    let reusedExisting = false;

    // If this email already has a login, don't fail -- attach this loan's
    // borrower record to the account they already have. That's the common
    // case for a borrower taking out a second loan.
    const existing = await findUserByEmail(svc, opts.email);

    if (existing) {
      userId = existing.id;
      reusedExisting = true;
      message = `${opts.email} already had an account, so this loan was connected to it.`;
    } else if (opts.mode === 'invite') {
      userId = await createUserAndEmailInvite(svc, opts.email, opts.fullName, site, 'borrower');
      message = `Invitation emailed to ${opts.email}.`;
    } else {
      // A temporary password is a real password until they change it.
      assertStrongPassword(opts.tempPassword || '', opts.email);
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

    if (!userId) throw new Error('Could not create or find the login for that email.');

    // Never demote an existing admin/staff account to borrower.
    const { data: currentProfile } = await svc.from('profiles').select('role').eq('id', userId).maybeSingle();
    const keepRole = currentProfile?.role === 'admin' || currentProfile?.role === 'staff';
    await svc.from('profiles').upsert({
      id: userId,
      email: opts.email,
      full_name: opts.fullName || null,
      role: keepRole ? currentProfile!.role : 'borrower',
    }, { onConflict: 'id' });

    await svc.from('borrowers').update({ user_id: userId, email: opts.email }).eq('id', opts.borrowerId);
    const linked = await syncBorrowerLinksForEmail(svc, opts.email);
    await logActivity('borrower_login_created', opts.loanId, await actorId(),
      `${opts.email}${linked > 1 ? ` · ${linked} loans linked` : ''}`);
    if (linked > 1) {
      message += ` ${linked} loans are now connected to this login.`;
    }
    if (reusedExisting) {
      message += ' They should sign in with their existing password.';
    }

    revalidatePath(`/admin/loans/${opts.loanId}`);
    revalidatePath('/admin/users');
    return { message, linked };
  });
}

/** Email a password-reset link. */
async function emailResetLink(email: string, link: string) {
  await sendMail({
    to: email,
    subject: 'Reset your Jay Capital Funding password',
    html: brandShell(
      `<p style="margin:0 0 14px">A password reset was requested for your Jay Capital Funding account.</p>
       ${button(link, 'Set a new password')}
       ${rawLink(link)}
       <p style="margin:14px 0 0;color:#6B7A90;font-size:13px">If you did not request this, you can ignore this email.</p>`
    ),
  });
}

/** Shared: email a newly-created user their temporary login credentials. */
async function emailCredentials(email: string, fullName: string, tempPassword: string, site: string) {
  const muted = '#6B7A90';
  await sendMail({
    to: email,
    subject: 'Your Jay Capital Funding login',
    html: brandShell(
      `<p style="margin:0 0 14px">Hi ${fullName || 'there'},</p>
       <p style="margin:0 0 14px">An account has been created for you on the Jay Capital Funding portal. Here are your temporary login details:</p>
       <table style="margin:0 0 16px">
         <tr><td style="padding:4px 12px 4px 0;color:${muted}">Email</td><td style="font-weight:700">${email}</td></tr>
         <tr><td style="padding:4px 12px 4px 0;color:${muted}">Temporary password</td><td style="font-weight:700">${tempPassword}</td></tr>
       </table>
       ${site ? button(`${site}/login`, 'Sign in') : ''}
       <p style="margin:0;color:${muted};font-size:13px">Please sign in and change your password. If you have any questions, just reply to this email.</p>`
    ),
  });
}
