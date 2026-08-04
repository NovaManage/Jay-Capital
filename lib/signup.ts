'use server';

import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { run } from '@/lib/result';
import { serviceClient } from '@/lib/supabase-server';

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

function transport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('Email is not configured yet. Please contact Jay Capital Funding.');
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

function shell(inner: string) {
  const navy = '#04162A', gold = '#C0954A', muted = '#6B7A90';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F9FC;font-family:Arial,Helvetica,sans-serif;color:#333">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E4EAF3;border-radius:10px;padding:28px">
      <div style="color:${navy};font-weight:800;letter-spacing:.12em;font-size:17px">JAY CAPITAL</div>
      <div style="color:${gold};font-weight:700;letter-spacing:.3em;font-size:9px;margin-top:2px">FUNDING</div>
      <div style="height:2px;background:${gold};border-radius:2px;margin:12px 0 20px"></div>
      ${inner}
      <p style="margin:18px 0 0;color:${muted};font-size:12px">
        Jay Capital Funding · 33 Downtown Dr, Monsey, NY 10952 · (845) 828-0731
      </p>
    </div></body></html>`;
}

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
      const t = transport();
      const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
      await t.sendMail({
        from: `Jay Capital Funding <${from}>`, to: email, replyTo: from,
        subject: 'Your Jay Capital portal account',
        html: shell(`<p style="margin:0 0 14px">You already have a Jay Capital portal account for <b>${email}</b>.</p>
          <p style="margin:0 0 18px"><a href="${site}/login" style="background:#04162A;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">Sign in</a></p>
          <p style="margin:0;color:#6B7A90;font-size:13px">If you have forgotten your password, use “Forgot password” on the sign-in page.</p>`),
      });
      return { message: `We've emailed ${email} with a link to continue.` };
    }

    const token = await issueToken(email, 'signup');
    const link = `${site}/signup/${token}`;

    const t = transport();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
    await t.sendMail({
      from: `Jay Capital Funding <${from}>`, to: email, replyTo: from,
      subject: 'Set up your Jay Capital portal account',
      html: shell(`<p style="margin:0 0 14px">Hi,</p>
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
    if (!password || password.length < 8) {
      throw new Error('Please choose a password of at least 8 characters.');
    }

    const svc = serviceClient();
    const { data: row } = await svc.from('portal_signup_tokens').select('*').eq('token', token).maybeSingle();
    if (!row) throw new Error('This link is not valid. Please request a new one.');
    if (row.used_at) throw new Error('This link has already been used. Please request a new one.');
    if (new Date(row.expires_at) < new Date()) throw new Error('This link has expired. Please request a new one.');

    const email: string = row.email;

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

    // Claim only unclaimed records, so signing up can never take a loan off
    // an account that already holds it.
    const claimable = borrowers.filter(b => !b.user_id).map(b => b.id);
    if (claimable.length) {
      await svc.from('borrowers').update({ user_id: userId }).in('id', claimable);
    }

    await svc.from('portal_signup_tokens').update({ used_at: new Date().toISOString() }).eq('token', token);

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

    // Release records held under the old address, then claim unclaimed ones
    // under the new address. Records claimed by somebody else are untouched.
    await svc.from('borrowers').update({ user_id: null }).eq('user_id', user.id);
    const { data: matches } = await svc.from('borrowers').select('id, name, user_id').ilike('email', email);
    const claimable = (matches ?? []).filter(b => !b.user_id).map(b => b.id);
    if (claimable.length) {
      await svc.from('borrowers').update({ user_id: user.id }).in('id', claimable);
      const name = (matches ?? [])[0]?.name;
      if (name) await svc.from('profiles').update({ full_name: name }).eq('id', user.id);
    }

    return {
      email,
      linked: claimable.length,
      message: claimable.length
        ? `Your email is now ${email}, with ${claimable.length} loan${claimable.length === 1 ? '' : 's'} linked.`
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
          const t = transport();
          const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
          await t.sendMail({
            from: `Jay Capital Funding <${from}>`, to: email, replyTo: from,
            subject: 'Reset your Jay Capital password',
            html: shell(`<p style="margin:0 0 14px">A password reset was requested for your Jay Capital portal account.</p>
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
