import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Next.js patches global fetch and caches responses in its Data Cache.
 * Service-role requests are byte-identical every time -- same URL, same key,
 * no cookie -- so they cache perfectly and a borrower statement kept showing
 * deleted payments and stale draws long after the admin side had moved on.
 * (`export const dynamic = 'force-dynamic'` governs RENDERING; it does not
 * reliably reach fetches issued from inside a third-party client.)
 *
 * Every database read here is live data, so nothing should ever be cached.
 */
const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input as any, { ...(init as any), cache: 'no-store' });

/** Server client bound to the request's cookies (App Router, ssr >=0.5 API). */
export function serverClient() {
  const store = cookies();
  return createServerClient(URL, ANON, {
    global: { fetch: noStoreFetch },
    cookies: {
      getAll() { return store.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
        try { cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Component context &mdash; middleware refreshes instead */ }
      },
    },
  });
}

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY. Server-only.
 * Used for the token-based borrower statement lookup (no signed-in user).
 */
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(URL, key, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  });
}
