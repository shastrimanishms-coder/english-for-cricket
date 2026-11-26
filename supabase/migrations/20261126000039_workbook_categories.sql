-- ============================================================================
-- Migration 39 (Round 88): workbooks become their own category type.
--
-- Findings from checking the live schema first:
--   * public.content_categories.content_type carries the CHECK written
--     in migration 38:
--       check (content_type in ('games','reading','speaking',
--                               'downloads','videos'))
--     so 'workbooks' memberships are REJECTED until it is extended.
--   * public.categories.type: no migration in this repo defines a
--     CHECK on it (the table predates the migration history), and the
--     live values are exactly the five content types above (verified
--     2026-11-26). To be safe either way, this migration replaces ANY
--     existing type-list CHECK on categories with the extended set,
--     and adds the extended CHECK if none exists - the extended set
--     also keeps 'curriculum', which the Categories manager offers.
--
-- Both replacements only ever WIDEN the permitted values, and both
-- are re-run safe. Nothing else changes: no new tables, no backfill
-- (workbook games start uncategorised in the new tree), and the app
-- degrades gracefully until this runs - 'workbooks' category reads
-- return empty and writes fall back to the legacy primary only,
-- exactly as the app behaved before migration 38.
-- ============================================================================

-- 1) content_categories.content_type: add 'workbooks' -------------------------
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.content_categories'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%content_type%'
  loop
    execute format('alter table public.content_categories drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.content_categories
  add constraint content_categories_content_type_check
  check (content_type in ('games', 'reading', 'speaking', 'downloads', 'videos', 'workbooks'));

-- 2) categories.type: add 'workbooks' -----------------------------------------
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.categories'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%type%'
      and pg_get_constraintdef(c.oid) ilike '%games%'
  loop
    execute format('alter table public.categories drop constraint %I', con.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_type_check'
  ) then
    alter table public.categories
      add constraint categories_type_check
      check (type in ('curriculum', 'downloads', 'games', 'videos', 'speaking', 'reading', 'workbooks'));
  end if;
end $$;
