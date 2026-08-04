-- ============================================================
-- Jay Capital -- Postgres schema (Supabase)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- roles ----------
create type user_role as enum ('admin', 'staff', 'borrower');

-- Profile row per auth user. Role drives all access.
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        user_role not null default 'borrower',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- borrowers ----------
create table public.borrowers (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  email       text,
  phone       text,
  -- links a borrower record to a login (nullable: not every borrower has one)
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- lenders ----------
create table public.lenders (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- loans ----------
create table public.loans (
  id              uuid primary key default uuid_generate_v4(),
  loan_number     text not null unique,             -- L001, L002, ...
  borrower_id     uuid not null references public.borrowers(id) on delete restrict,
  lender_id       uuid references public.lenders(id) on delete set null,
  property        text not null,
  loan_amount     numeric(14,2) not null check (loan_amount >= 0),
  acquisition     numeric(14,2) not null default 0 check (acquisition >= 0),
  construction    numeric(14,2) not null default 0 check (construction >= 0),
  annual_rate     numeric(6,4)  not null check (annual_rate >= 0),  -- 0.1200 = 12%
  closing_date    date not null,
  status          text not null default 'active'
                  check (status in ('active','paid_off','defaulted')),
  -- unguessable public token for the borrower statement link
  access_token    text not null unique default replace(uuid_generate_v4()::text,'-',''),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint acq_plus_constr check (acquisition + construction <= loan_amount)
);

create index loans_borrower_idx on public.loans(borrower_id);
create index loans_token_idx    on public.loans(access_token);

-- ---------- draws ----------
create table public.draws (
  id          uuid primary key default uuid_generate_v4(),
  loan_id     uuid not null references public.loans(id) on delete cascade,
  draw_date   date not null,
  description text not null default 'Construction Draw',
  amount      numeric(14,2) not null check (amount >= 0),
  created_at  timestamptz not null default now()
);
create index draws_loan_idx on public.draws(loan_id, draw_date);

-- ---------- payments (borrower remittances) ----------
create table public.payments (
  id            uuid primary key default uuid_generate_v4(),
  loan_id       uuid not null references public.loans(id) on delete cascade,
  payment_date  date not null,
  amount        numeric(14,2) not null check (amount >= 0),
  note          text,
  created_at    timestamptz not null default now()
);
create index payments_loan_idx on public.payments(loan_id, payment_date);

-- ============================================================
-- Interest logic, in SQL, mirroring the sheet exactly.
-- ============================================================

-- Interest on a single draw for the month it was taken:
--   amount * (rate/12) / days_in_month * days_from_draw_through_month_end
create or replace function public.draw_interest(
  p_amount numeric, p_rate numeric, p_draw_date date
) returns numeric language sql immutable as $$
  select round(
    p_amount * (p_rate / 12.0)
    / extract(day from (date_trunc('month', p_draw_date) + interval '1 month - 1 day'))::numeric
    * ( extract(day from (date_trunc('month', p_draw_date) + interval '1 month - 1 day'))::numeric
        - extract(day from p_draw_date)::numeric + 1 )
  , 2);
$$;

-- Per-draw interest, exposed as a view for the statement table.
--
-- SECURITY: both views below MUST carry security_invoker (see migration 004).
-- Without it a view runs as its owner and bypasses RLS on every underlying
-- table, which silently exposed the entire loan book.
create or replace view public.draw_details as
select
  d.id, d.loan_id, d.draw_date, d.description, d.amount,
  case when d.description = 'Construction Draw'
       then public.draw_interest(d.amount, l.annual_rate, d.draw_date)
       else null end as interest_accrued
from public.draws d
join public.loans l on l.id = d.loan_id;
alter view public.draw_details set (security_invoker = on);

-- Loan-level rollups (total disbursed, remaining, all-time accrued interest).
create or replace view public.loan_summary as
select
  l.id as loan_id,
  l.loan_number,
  l.property,
  l.loan_amount,
  l.acquisition,
  l.construction,
  l.annual_rate,
  l.closing_date,
  l.status,
  l.access_token,
  b.id    as borrower_id,
  b.name  as borrower_name,
  b.email as borrower_email,
  b.phone as borrower_phone,
  ld.name as lender_name,
  l.acquisition + coalesce(dr.total_draws, 0)                    as total_disbursed,
  l.loan_amount - (l.acquisition + coalesce(dr.total_draws, 0))  as remaining_draw,
  coalesce(dr.total_interest, 0)                                 as accrued_interest,
  coalesce(pm.total_paid, 0)                                     as total_paid,
  l.is_entity,
  l.entity_name,
  l.lender_id,
  ld.short_name as lender_short_name
from public.loans l
join public.borrowers b on b.id = l.borrower_id
left join public.lenders ld on ld.id = l.lender_id
left join (
  select
    dd.loan_id,
    sum(dd.amount) filter (where dd.description = 'Construction Draw') as total_draws,
    sum(coalesce(dd.interest_accrued, 0))                              as total_interest
  from public.draw_details dd
  group by dd.loan_id
) dr on dr.loan_id = l.id
left join (
  select loan_id, sum(amount) as total_paid
  from public.payments
  group by loan_id
) pm on pm.loan_id = l.id;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles  enable row level security;
alter table public.borrowers enable row level security;
alter table public.lenders   enable row level security;
alter table public.loans     enable row level security;
alter table public.draws     enable row level security;
alter table public.payments  enable row level security;

-- helper: current user's role
create or replace function public.current_role()
returns user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.current_role() = 'admin' $$;

create or replace function public.is_staff_or_admin() returns boolean
language sql stable as $$ select public.current_role() in ('admin','staff') $$;

-- profiles: you can read your own; admins read all
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- borrowers / lenders / loans / draws / payments:
--   admin  -> full read+write
--   staff  -> read only
--   borrower -> only their own loans (via borrowers.user_id)
create policy borrowers_read on public.borrowers
  for select using (public.is_staff_or_admin() or user_id = auth.uid());
create policy borrowers_write on public.borrowers
  for all using (public.is_admin()) with check (public.is_admin());

create policy lenders_read on public.lenders
  for select using (public.is_staff_or_admin());
create policy lenders_write on public.lenders
  for all using (public.is_admin()) with check (public.is_admin());

create policy loans_read on public.loans
  for select using (
    public.is_staff_or_admin()
    or borrower_id in (select id from public.borrowers where user_id = auth.uid())
  );
create policy loans_write on public.loans
  for all using (public.is_admin()) with check (public.is_admin());

create policy draws_read on public.draws
  for select using (
    public.is_staff_or_admin()
    or loan_id in (
      select l.id from public.loans l
      join public.borrowers b on b.id = l.borrower_id
      where b.user_id = auth.uid()
    )
  );
create policy draws_write on public.draws
  for all using (public.is_admin()) with check (public.is_admin());

create policy payments_read on public.payments
  for select using (
    public.is_staff_or_admin()
    or loan_id in (
      select l.id from public.loans l
      join public.borrowers b on b.id = l.borrower_id
      where b.user_id = auth.uid()
    )
  );
create policy payments_write on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- auto-create a profile row on signup (default role: borrower)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'borrower')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep loans.updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists loans_touch on public.loans;
create trigger loans_touch before update on public.loans
  for each row execute function public.touch_updated_at();
alter view public.loan_summary set (security_invoker = on);
