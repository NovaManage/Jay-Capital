import { createBrowserClient } from '@supabase/ssr';

/** Browser client -- respects RLS as the signed-in user. Client components only. */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
