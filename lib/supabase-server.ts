import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server client bound to the request's cookies (App Router, ssr >=0.5 API). */
export function serverClient() {
  const store = cookies();
  return createServerClient(URL, ANON, {
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
  return createClient(URL, key, { auth: { persistSession: false } });
}
