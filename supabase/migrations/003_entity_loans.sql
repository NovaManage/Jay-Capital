-- ============================================================
-- Jay Capital -- optional entity name on a loan
-- Run in the Supabase SQL editor BEFORE deploying this batch.
-- Additive: existing loans stay personal-name loans.
-- ============================================================

alter table public.loans add column if not exists is_entity   boolean not null default false;
alter table public.loans add column if not exists entity_name text;

-- Expose both on the view. Borrower-facing screens use entity_name when
-- is_entity is set; the dashboard always uses the personal name.
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
  l.is_entity,
  l.entity_name,
  l.lender_id,
  b.id    as borrower_id,
  b.name  as borrower_name,
  b.email as borrower_email,
  b.phone as borrower_phone,
  ld.name as lender_name,
  ld.short_name as lender_short_name,
  l.acquisition + coalesce(dr.total_draws, 0)                    as total_disbursed,
  l.loan_amount - (l.acquisition + coalesce(dr.total_draws, 0))  as remaining_draw,
  coalesce(dr.total_interest, 0)                                 as accrued_interest,
  coalesce(pm.total_paid, 0)                                     as total_paid
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
