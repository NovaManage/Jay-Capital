-- ============================================================
-- 004  CRITICAL SECURITY FIX + self-service borrower signup
--
-- Already applied to production on 2026-08-03. Kept here so a rebuilt
-- database is not silently insecure.
--
-- THE BUG: loan_summary and draw_details are views owned by `postgres`.
-- A Postgres view runs with its OWNER's privileges unless security_invoker
-- is set, so both views bypassed row level security on loans / borrowers /
-- draws / payments completely. Every RLS policy in this schema was never
-- consulted for anything read through them -- which is every borrower-facing
-- read in the app.
--
-- Measured before the fix, as the anon role (whose key ships publicly in the
-- browser bundle): loan_summary returned all 6 loans and draw_details all 9
-- draws, while `select from loans` correctly returned 0.
-- ============================================================

alter view public.loan_summary set (security_invoker = on);
alter view public.draw_details set (security_invoker = on);

-- anon is unauthenticated and has no business touching loan data; the public
-- statement page reads through the service role instead.
revoke all on public.loan_summary        from anon;
revoke all on public.draw_details        from anon;
revoke all on public.loans               from anon;
revoke all on public.borrowers           from anon;
revoke all on public.lenders             from anon;
revoke all on public.draws               from anon;
revoke all on public.payments            from anon;
revoke all on public.payment_allocations from anon;
revoke all on public.profiles            from anon;

revoke insert, update, delete, truncate on public.loan_summary from authenticated;
revoke insert, update, delete, truncate on public.draw_details from authenticated;
grant select on public.loan_summary to authenticated;
grant select on public.draw_details to authenticated;

-- ---------- self-service borrower signup ----------
create table if not exists public.portal_signup_tokens (
  token       text primary key,
  email       text not null,
  purpose     text not null default 'signup',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create index if not exists portal_signup_tokens_email_idx on public.portal_signup_tokens (lower(email));
alter table public.portal_signup_tokens enable row level security;
revoke all on public.portal_signup_tokens from anon, authenticated;
