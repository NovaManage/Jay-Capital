-- ============================================================
-- Jay Capital -- optional entity name on a loan
-- Run in the Supabase SQL editor BEFORE deploying this batch.
-- Additive: existing loans stay personal-name loans.
--
-- NOTE ON THE VIEW: `create or replace view` may only APPEND columns to the
-- end of the existing list. Inserting them in the middle makes Postgres think
-- you are renaming an existing column and it refuses:
--   ERROR 42P16: cannot change name of view column "borrower_id" to "is_entity"
-- So the original 19 columns stay in their exact original order and the four
-- new ones are added at the end. Safe to re-run.
-- ============================================================

alter table public.loans add column if not exists is_entity   boolean not null default false;
alter table public.loans add column if not exists entity_name text;

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
  -- new columns, appended:
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
