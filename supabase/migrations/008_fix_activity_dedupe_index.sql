-- ============================================================
-- 008  Repair activity logging
-- Already applied to production on 2026-08-13.
--
-- 007 created the dedupe index as PARTIAL (WHERE dedupe_key IS NOT NULL).
-- Postgres cannot infer a partial index from "on conflict (dedupe_key)"
-- unless the statement repeats the predicate, which PostgREST does not emit.
-- Every logged event therefore raised 42P10, and logActivity -- which
-- deliberately swallows errors so analytics can never break a statement --
-- discarded it. Activity stopped recording entirely.
--
-- A plain unique index is inferable. The app now always supplies a dedupe_key:
-- a time bucket for kinds that should collapse, and a random value for
-- deliberate actions, which must never collapse.
-- ============================================================

drop index if exists public.portal_activity_dedupe_key;
create unique index if not exists portal_activity_dedupe_key
  on public.portal_activity (dedupe_key);

update public.portal_activity
set dedupe_key = 'legacy:' || id::text
where dedupe_key is null;
