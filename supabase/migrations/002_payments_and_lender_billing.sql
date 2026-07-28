-- ============================================================
-- Jay Capital -- lender billing details + payment allocations
-- Run in the Supabase SQL editor BEFORE deploying this batch.
-- Additive only; nothing existing changes behaviour.
-- ============================================================

-- ---------- lenders: short name + how borrowers pay ----------
alter table public.lenders add column if not exists short_name           text;
alter table public.lenders add column if not exists payment_method       text;   -- e.g. 'Wire' / 'Zelle QuickPay'
alter table public.lenders add column if not exists payment_instructions text;   -- free text shown to the borrower

-- Backfill short_name so the dashboard has something to show.
update public.lenders set short_name = name where short_name is null;

-- ---------- payments: how it arrived ----------
alter table public.payments add column if not exists method text;

-- ---------- allocations: which charge a payment pays ----------
-- A "charge" is one statement period's interest. It is computed, not stored,
-- so an allocation just names the period it applies to.
create table if not exists public.payment_allocations (
  id           uuid primary key default uuid_generate_v4(),
  payment_id   uuid not null references public.payments(id) on delete cascade,
  loan_id      uuid not null references public.loans(id)    on delete cascade,
  period_month date not null,                     -- first day of the CHARGE period
  amount       numeric(14,2) not null check (amount >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists payment_allocations_payment_idx on public.payment_allocations(payment_id);
create index if not exists payment_allocations_loan_idx    on public.payment_allocations(loan_id, period_month);

alter table public.payment_allocations enable row level security;

-- Same visibility rules as payments: staff/admin see everything,
-- a borrower sees only rows on their own loans.
drop policy if exists payment_allocations_read on public.payment_allocations;
create policy payment_allocations_read on public.payment_allocations
  for select using (
    public.is_staff_or_admin()
    or loan_id in (
      select l.id from public.loans l
      join public.borrowers b on b.id = l.borrower_id
      where b.user_id = auth.uid()
    )
  );

drop policy if exists payment_allocations_write on public.payment_allocations;
create policy payment_allocations_write on public.payment_allocations
  for all using (public.is_admin()) with check (public.is_admin());
