-- ============================================================
-- 006  Invitation status tracking
-- Already applied to production on 2026-08-05.
-- ============================================================
alter table public.profiles add column if not exists invited_at   timestamptz;
alter table public.profiles add column if not exists activated_at timestamptz;
alter table public.profiles add column if not exists last_seen_at timestamptz;

update public.profiles
set activated_at = created_at
where activated_at is null
  and (role in ('admin', 'staff')
       or id in (select user_id from public.borrowers where user_id is not null));
