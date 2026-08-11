/**
 * Shared result shape for server actions.
 *
 * Next.js redacts thrown-error messages from Server Actions in production
 * ("An error occurred in the Server Components render..."), which leaves the
 * user with no idea why something failed. So actions RETURN this instead of
 * throwing, and the message survives the trip to the browser.
 */
export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  /** Success text worth showing the user. */
  message?: string;
  /** Failure reason, safe to show the user. Present only when ok === false. */
  error?: string;
  /** emailStatement: how many statements went out, and to whom. */
  count?: number;
  to?: string;
  /** account setup: the address the login was created for. */
  email?: string;
  /** account setup: how many borrower records were linked to the login. */
  linked?: number;
}

/** Turn a caught error into something a non-technical user can act on. */
export function friendlyMessage(e: any): string {
  const raw = String(e?.message ?? e ?? 'Something went wrong.');

  if (/already been registered|already registered|already exists/i.test(raw)) {
    return 'An account already exists for that email address. You can change their role from the Users page, or use a different address.';
  }
  if (/Invalid login|EAUTH|535/i.test(raw)) {
    return 'The mail server rejected the login, so the email was not sent. Check the SMTP username and password in the site settings.';
  }
  if (/SMTP is not configured/i.test(raw)) {
    return 'Email is not configured yet (SMTP_HOST, SMTP_USER, SMTP_PASS). The rest of the action did not run.';
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EDNS/i.test(raw)) {
    return 'Could not reach the mail server. Check SMTP_HOST and SMTP_PORT, then try again.';
  }
  // Supabase's own minimum is shorter than ours; our policy message is the
  // one that matches what the app actually enforces.
  if (/Password should be at least|password.*6 characters/i.test(raw)) {
    return 'That password does not meet the requirements. Use at least 8 characters with a mix of upper case, lower case, numbers and a symbol.';
  }
  if (/Unable to validate email address|invalid format/i.test(raw)) {
    return 'That email address does not look valid. Please check it and try again.';
  }
  if (/Admin only/i.test(raw)) {
    return 'Only an admin can do that.';
  }
  if (/Staff or admin only/i.test(raw)) {
    return 'You need staff or admin access to do that.';
  }
  if (/Not signed in/i.test(raw)) {
    return 'Your session expired. Please sign in again.';
  }
  return raw;
}

/**
 * Run an action body, converting any throw into a returned error.
 * Plain-object results are merged up, so an action that returns
 * { message } comes back as { ok: true, message }. Everything else
 * (arrays, primitives, void) lands on `data`.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ok: true, ...(value as Record<string, unknown>) };
    }
    return { ok: true, data: value };
  } catch (e: any) {
    return { ok: false, error: friendlyMessage(e) };
  }
}
