-- ============================================================
-- 005  Borrower link must agree with the email + admin insights
-- Already applied to production on 2026-08-03.
--
-- THE BUG: borrowers.user_id was the only thing deciding which account sees
-- which loan, and nothing re-synced it when an admin changed a loan's
-- borrower email. Records kept pointing at the OLD account, so:
--   * the old account kept access it should have lost, and
--   * the correct account could not claim the record (signup only took
--     unclaimed ones), so a borrower who signed up with the right address
--     was told they had no loans.
--
-- Access now requires BOTH the user_id link AND the record's email to match
-- the signed-in user's verified email, so a stale link fails CLOSED.
-- ============================================================

create or replace function public.my_borrower_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select b.id
  from public.borrowers b
  where b.user_id = auth.uid()
    and lower(b.email) = lower(nullif(auth.jwt() ->> 'email', ''))
$$;

update public.borrowers b
set user_id = p.id
from public.profiles p
where lower(p.email) = lower(b.email)
  and b.user_id is distinct from p.id;

update public.borrowers b
set user_id = null
where b.user_id is not null
  and not exists (
    select 1 from public.profiles p
    where p.id = b.user_id and lower(p.email) = lower(b.email)
  );

drop policy if exists loans_read on public.loans;
create policy loans_read on public.loans
  for select using (
    public.is_staff_or_admin() or borrower_id in (select public.my_borrower_ids())
  );

drop policy if exists draws_read on public.draws;
create policy draws_read on public.draws
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l where l.borrower_id in (select public.my_borrower_ids()))
  );

drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l where l.borrower_id in (select public.my_borrower_ids()))
  );

drop policy if exists payment_allocations_read on public.payment_allocations;
create policy payment_allocations_read on public.payment_allocations
  for select using (
    public.is_staff_or_admin()
    or loan_id in (select l.id from public.loans l where l.borrower_id in (select public.my_borrower_ids()))
  );

drop policy if exists borrowers_read on public.borrowers;
create policy borrowers_read on public.borrowers
  for select using (
    public.is_staff_or_admin() or id in (select public.my_borrower_ids())
  );

-- ---------- first-party activity log for the insights page ----------
create table if not exists public.portal_activity (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  kind        text not null,
  loan_id     uuid references public.loans(id) on delete set null,
  user_id     uuid,
  created_at  timestamptz not null default now()
);
create index if not exists portal_activity_time_idx on public.portal_activity (occurred_at desc);
create index if not exists portal_activity_loan_idx on public.portal_activity (loan_id, occurred_at desc);
alter table public.portal_activity enable row level security;
revoke all on public.portal_activity from anon, authenticated;
drop policy if exists portal_activity_read on public.portal_activity;
create policy portal_activity_read on public.portal_activity
  for select using (public.is_staff_or_admin());
grant select on public.portal_activity to authenticated;
