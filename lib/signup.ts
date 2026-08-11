'use server';

import { randomBytes } from 'crypto';
import { run } from '@/lib/result';
import { serviceClient } from '@/lib/supabase-server';
import { sendMail, brandShell, button, rawLink } from '@/lib/mailer';
import { syncBorrowerLinksForEmail, releaseMismatchedLinks } from '@/lib/borrower-links';
import { logActivity } from '@/lib/activity';
import { assertStrongPassword } from '@/lib/password';

/**
 * Borrower self-service signup.
 *
 * Deliberately NOT Supabase's magic link. That flow is PKCE: the code
 * verifier is written to the browser that started it, so opening the link
 * from a mail app -- a different browser, often a different device -- fails
 * with "PKCE code verifier not found in storage". It also burns Supabase's
 * mail quota. We send our own link through the same SMTP the statements use,
 * carrying a single-use token we control.
 *
 * ACCESS MODEL: a borrower is linked to loans by matching their verified
 * email against borrowers.email. Access itself is enforced in the database by
 * RLS, not here -- these functions only ever set borrowers.user_id.
 */

const TOKEN_TTL_MIN = 60;

async function issueToken(email: string, purpose: string): Promise<string> {
  const svc = serviceClient();
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString();
  const { error } = await svc.from('portal_signup_tokens')
    .insert({ token, email: email.toLowerCase(), purpose, expires_at: expires });
  if (error) throw new Error(error.message);
  return token;
}

/**
 * Step 1: the borrower enters their email and we send them a link.
 *
 * The reply is identical whether or not the address matches a loan. Saying
 * "no loans found" here would let anyone probe which addresses are borrowers;
 * they are told after they have proved they own the mailbox.
 */
export async function requestPortalSignup(emailRaw: string) {
  return run(async () => {
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }

    const svc = serviceClient();
    const site = process.env.NEXT_PUBLIC_SITE_URL || '';

    // Already has a login? Point them at sign-in instead of making a second one.
    const { data: existing } = await svc.from('profiles').select('id').ilike('email', email).maybeSingle();

    if (existing) {
      await sendMail({

        to: email,
        subject: 'Your Jay Capital portal account',
        html: brandShell(`<p style="margin:0 0 14px">You already have a Jay Capital portal account for <b>${email}</b>.</p>
          <p style="margin:0 0 18px"><a href="${site}/login" style="background:#04162A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">Sign in</a></p>
          <p style="margin:0;color:#6B7A90;font-size:13px">If you have forgotten your password, use “Forgot password” on the sign-in page.</p>`),
      });
      return { message: `We've emailed ${email} with a link to continue.` };
    }

    const token = await issueToken(email, 'signup');
    const link = `${site}/signup/${token}`;

    await sendMail({


      to: email,
      subject: 'Set up your Jay Capital portal account',
      html: brandShell(`<p style="margin:0 0 14px">Hi,</p>
        <p style="margin:0 0 14px">Use the button below to choose a password and finish setting up your Jay Capital borrower portal.</p>
        <p style="margin:0 0 18px"><a href="${link}" style="background:#04162A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">Set my password</a></p>
        <p style="margin:0 0 6px;color:#6B7A90;font-size:12px;word-break:break-all">Or paste this into your browser:<br/>${link}</p>
        <p style="margin:14px 0 0;color:#6B7A90;font-size:13px">This link expires in ${TOKEN_TTL_MIN} minutes and can be used once. If you didn’t request it, you can ignore this email.</p>`),
    });

    return { message: `We've emailed ${email} with a link to continue.` };
  });
}

/** Look up a signup token for the set-password page. */
export async function inspectSignupToken(token: string) {
  return run(async () => {
    const svc = serviceClient();
    const { data } = await svc.from('portal_signup_tokens').select('*').eq('token', token).maybeSingle();
    if (!data) throw new Error('This link is not valid. Please request a new one.');
    if (data.used_at) throw new Error('This link has already been used. Please request a new one.');
    if (new Date(data.expires_at) < new Date()) throw new Error('This link has expired. Please request a new one.');
    return { email: data.email as string };
  });
}

/**
 * Step 2: they choose a password. Only now do we look for matching loans,
 * because only now have they proved they control the address.
 */
export async function completePortalSignup(token: string, password: string) {
  return run(async () => {
    const svc = serviceClient();
    const { data: row } = await svc.from('portal_signup_tokens').select('*').eq('token', token).maybeSingle();
    if (!row) throw new Error('This link is not valid. Please request a new one.');
    if (row.used_at) throw new Error('This link has already been used. Please request a new one.');
    if (new Date(row.expires_at) < new Date()) throw new Error('This link has expired. Please request a new one.');

    const email: string = row.email;
    // Checked against the address too, so nobody sets their own email as the password.
    assertStrongPassword(password, email);

    // Borrower records carrying this address. Matching is case-insensitive;
    // the address is verified by the fact they opened this link.
    const { data: matches } = await svc.from('borrowers').select('id, name, user_id').ilike('email', email);
    const borrowers = matches ?? [];

    const { data: created, error: cErr } = await svc.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: borrowers[0]?.name ?? null },
    });
    if (cErr) throw new Error(cErr.message);
    const userId = created?.user?.id;
    if (!userId) throw new Error('The account could not be created. Please contact Jay Capital Funding.');

    // Self-signup can only ever produce a borrower. Admin and staff accounts
    // are created by an existing admin, never here.
    await svc.from('profiles').upsert({
      id: userId, email, full_name: borrowers[0]?.name ?? null, role: 'borrower',
    }, { onConflict: 'id' });

    // Claim every record carrying this address -- including any still pointing
    // at a previous account. The email on the record is what decides ownership,
    // so a link left behind by an admin email change must not block the
    // rightful account. RLS cross-checks the email, so this cannot hand over a
    // record whose email does not match.
    await syncBorrowerLinksForEmail(svc, email);

    await svc.from('portal_signup_tokens').update({ used_at: new Date().toISOString() }).eq('token', token);
    await logActivity('account_created', null, userId);

    const { count } = await svc.from('loans')
      .select('id', { count: 'exact', head: true })
      .in('borrower_id', borrowers.length ? borrowers.map(b => b.id) : ['00000000-0000-0000-0000-000000000000']);

    return {
      email,
      linked: count ?? 0,
      name: borrowers[0]?.name ?? null,
      message: (count ?? 0) > 0
        ? `Your account is ready. ${count} loan${count === 1 ? '' : 's'} linked.`
        : 'noloans',
    };
  });
}

/**
 * A signed-in borrower corrects the address on their account -- the usual fix
 * when they signed up with a personal address but the loan is under a
 * different one. Re-links against the new address.
 */
export async function changeMyEmail(newEmailRaw: string) {
  return run(async () => {
    const { serverClient } = await import('@/lib/supabase-server');
    const supabase = serverClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in again.');

    const email = String(newEmailRaw || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error('Please enter a valid email address.');
    }
    if (email === String(user.email || '').toLowerCase()) {
      throw new Error('That is already the email on your account.');
    }

    const svc = serviceClient();

    const { data: taken } = await svc.from('profiles').select('id').ilike('email', email).maybeSingle();
    if (taken && taken.id !== user.id) {
      throw new Error('Another account already uses that email address. Please contact Jay Capital Funding.');
    }

    const { error: uErr } = await svc.auth.admin.updateUserById(user.id, { email, email_confirm: true });
    if (uErr) throw new Error(uErr.message);
    await svc.from('profiles').update({ email }).eq('id', user.id);

    // Release whatever was held under the old address, then take the records
    // carrying the new one.
    await releaseMismatchedLinks(svc, user.id, email);
    const linked = await syncBorrowerLinksForEmail(svc, email);

    await logActivity('email_changed', null, user.id);
    const { data: matches } = await svc.from('borrowers').select('name').ilike('email', email).limit(1);
    const name = (matches ?? [])[0]?.name;
    if (name) await svc.from('profiles').update({ full_name: name }).eq('id', user.id);

    return {
      email,
      linked,
      message: linked
        ? `Your email is now ${email}, with ${linked} loan${linked === 1 ? '' : 's'} linked.`
        : `Your email is now ${email}, but we still could not find a loan registered to it.`,
    };
  });
}

/** Public "forgot password", sent through our own SMTP. */
export async function requestPasswordReset(emailRaw: string) {
  return run(async () => {
    const email = String(emailRaw || '').trim().toLowerCase();
    if (!email) throw new Error('Please enter your email address.');

    const svc = serviceClient();
    const site = process.env.NEXT_PUBLIC_SITE_URL || '';
    const { data: profile } = await svc.from('profiles').select('id').ilike('email', email).maybeSingle();

    // Same reply either way -- otherwise this becomes an account oracle.
    if (profile) {
      const { data, error } = await svc.auth.admin.generateLink({
        type: 'recovery', email,
        options: { redirectTo: site ? `${site}/auth/callback?next=/auth/set-password` : undefined },
      });
      if (!error) {
        const link = (data as any)?.properties?.action_link;
        if (link) {
          await sendMail({

            to: email,
            subject: 'Reset your Jay Capital password',
            html: brandShell(`<p style="margin:0 0 14px">A password reset was requested for your Jay Capital portal account.</p>
              <p style="margin:0 0 18px"><a href="${link}" style="background:#04162A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">Set a new password</a></p>
              <p style="margin:0 0 6px;color:#6B7A90;font-size:12px;word-break:break-all">Or paste this into your browser:<br/>${link}</p>
              <p style="margin:14px 0 0;color:#6B7A90;font-size:13px">If you didn’t request this, you can ignore this email.</p>`),
          });
        }
      }
    }
    return { message: `If an account exists for ${email}, we've sent a reset link.` };
  });
}
