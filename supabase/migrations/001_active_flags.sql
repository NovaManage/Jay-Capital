-- ============================================================
-- Jay Capital -- adds inactivation support for lenders and users
-- Run this in the Supabase SQL editor BEFORE deploying this batch.
-- Additive only: every existing row defaults to active, so nothing
-- changes behaviour until you actually inactivate something.
-- ============================================================

alter table public.lenders  add column if not exists active boolean not null default true;
alter table public.profiles add column if not exists active boolean not null default true;

create index if not exists lenders_active_idx  on public.lenders (active);
create index if not exists profiles_active_idx on public.profiles (active);
