-- ============================================================
-- 007  Invitation status from auth, and richer activity
-- Already applied to production on 2026-08-13.
--
-- THE BUG: /go stamped profiles.activated_at using the SIGNED-IN USER's
-- client. profiles_admin_write restricts writes to admins, so for a borrower
-- or staff member the update matched zero rows and failed silently -- their
-- status read "awaiting setup" forever, however many times they signed in.
-- Admins were unaffected, which is why it appeared to work.
--
-- Fixed at the source: auth.users.last_sign_in_at is written by Supabase on
-- every sign-in and cannot be blocked by our policies. A trigger mirrors it
-- into profiles, so no application code is involved.
-- ============================================================

create or replace function public.sync_profile_signin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at
     and new.last_sign_in_at is not null then
    update public.profiles
    set activated_at = coalesce(activated_at, new.last_sign_in_at),
        last_seen_at = new.last_sign_in_at
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_signin on auth.users;
create trigger on_auth_user_signin
  after update on auth.users
  for each row execute function public.sync_profile_signin();

update public.profiles p
set activated_at = coalesce(p.activated_at, u.last_sign_in_at),
    last_seen_at = coalesce(u.last_sign_in_at, p.last_seen_at)
from auth.users u
where u.id = p.id and u.last_sign_in_at is not null;

-- ---------- richer, reliably de-duplicated activity ----------
alter table public.portal_activity add column if not exists detail     text;
alter table public.portal_activity add column if not exists dedupe_key text;

-- Check-then-insert loses the race when two renders arrive together, which is
-- how sign-ins were still doubling. A unique key makes the collapse atomic.
create unique index if not exists portal_activity_dedupe_key
  on public.portal_activity (dedupe_key) where dedupe_key is not null;
